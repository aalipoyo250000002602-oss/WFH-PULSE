// One controller per signed-in account. Never let late token callbacks rebind a logged-out account.
export function createMobilePushSession({ plugin, platform, installationId, apnsEnvironment = 'production',
    apiBaseUrl, accessToken, fetchImplementation = fetch, onReceive = () => {}, onOpen = () => {}, onError = () => {} }) {
    let stopped = false
    let bindingId
    let startPromise
    let stopPromise
    let registration = Promise.resolve()
    const listeners = []
    const pendingEvents = []
    async function request(method, body) {
        const response = await fetchImplementation(`${apiBaseUrl}/me/push-devices`, {
            method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ installationId, ...body }), signal: AbortSignal.timeout(10_000),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Device notification registration failed.')
        return result
    }
    const handleEvent = (kind, value) => {
        if (stopped) return
        if (!bindingId) {
            if (pendingEvents.length < 10) pendingEvents.push([kind, value])
            return
        }
        const data = kind === 'open' ? value : value.data
        if (data?.bindingId !== bindingId) return
        if (kind === 'open') onOpen(data); else onReceive(value)
    }
    const start = () => {
        if (startPromise) return startPromise
        startPromise = (async () => {
            if (stopped) return
            listeners.push(await plugin.addListener('registration', token => {
                if (stopped) return
                registration = registration.then(async () => {
                    if (stopped) return
                    const result = await request('PUT', { platform, token: token.value, apnsEnvironment })
                    if (!stopped) {
                        bindingId = result.bindingId
                        for (const [kind, value] of pendingEvents.splice(0)) handleEvent(kind, value)
                    }
                }).catch(error => { if (!stopped) onError(error) })
            }))
            listeners.push(await plugin.addListener('registrationError', () => {
                if (!stopped) onError(new Error('Device push registration failed.'))
            }))
            listeners.push(await plugin.addListener('pushNotificationReceived', notification => {
                handleEvent('receive', notification)
            }))
            listeners.push(await plugin.addListener('pushNotificationActionPerformed', action => {
                handleEvent('open', action.notification?.data)
            }))
            if (stopped) return
            let permission = await plugin.checkPermissions()
            if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
                permission = await plugin.requestPermissions()
            }
            if (permission.receive !== 'granted' || stopped) return
            if (platform === 'android') {
                await plugin.createChannel({ id: 'request-updates', name: 'Request updates',
                    description: 'Leave, adjustment, and overtime request updates', importance: 4, visibility: 0, sound: 'default' })
            }
            if (!stopped) await plugin.register()
        })()
        return startPromise
    }
    const stop = () => {
        if (stopPromise) return stopPromise
        stopped = true
        bindingId = undefined
        pendingEvents.length = 0
        stopPromise = (async () => {
            await startPromise?.catch(() => {})
            await registration
            try { await request('DELETE', {}) }
            finally {
                await Promise.allSettled([
                    plugin.unregister(), plugin.removeAllDeliveredNotifications(),
                    ...listeners.map(listener => listener.remove()),
                ])
            }
        })()
        return stopPromise
    }
    return { start, stop }
}
