import { createOfflineStore } from './offline-store.mjs'
import { createOfflineSync } from './offline-sync.mjs'

export function resolveSupabaseAuthBaseUrl(apiBaseUrl, supabaseUrl = '') {
    try {
        const apiUrl = new URL(apiBaseUrl)
        if (apiUrl.protocol !== 'https:' || !apiUrl.hostname.endsWith('.supabase.co')) return ''
        const projectUrl = new URL(supabaseUrl || apiUrl.origin)
        if (projectUrl.protocol !== 'https:' || !projectUrl.hostname.endsWith('.supabase.co')) return ''
        return `${projectUrl.origin}/auth/v1`
    } catch {
        return ''
    }
}

export function createApiFetch({
    apiBaseUrls = [],
    publishableKey = '',
    fetchImplementation = globalThis.fetch,
} = {}) {
    const restApiUrls = apiBaseUrls.flatMap(value => {
        try {
            const url = new URL(value)
            if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
                !/^\/rest\/v1\/?$/.test(url.pathname)) return []
            url.pathname = url.pathname.replace(/\/+$/, '')
            return [url]
        } catch {
            return []
        }
    })

    return async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input)
        let isRestApiRequest = false
        let restApiBase
        let parsedUrl
        try {
            const url = new URL(requestUrl)
            parsedUrl = url
            restApiBase = restApiUrls.find(base =>
                url.origin === base.origin &&
                (url.pathname === base.pathname || url.pathname.startsWith(`${base.pathname}/`))
            )
            isRestApiRequest = Boolean(restApiBase)
        } catch {}

        if (!isRestApiRequest || !publishableKey) return fetchImplementation(input, init)

        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
        headers.set('apikey', publishableKey)
        const routePath = parsedUrl.pathname.slice(restApiBase.pathname.length)
        if (/^\/(me|hr|employees|settings|meta|auth)(\/|$)/.test(routePath)) {
            const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
            const rawBody = init?.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(method.toUpperCase())
                ? await input.clone().text() : '')
            let body = {}
            try {
                body = rawBody ? JSON.parse(String(rawBody)) : {}
            } catch {
                return Response.json({ error: 'The Data API requires a JSON request body.' }, { status: 400 })
            }
            if (body === null || typeof body !== 'object' || Array.isArray(body)) {
                return Response.json({ error: 'Expected a JSON object.' }, { status: 400 })
            }
            headers.set('Content-Type', 'application/json')
            if (routePath === '/me/security-preferences/password' && method.toUpperCase() === 'POST') {
                const password = body.newPassword
                if (typeof password !== 'string' || password.length < 8 || password.length > 30 ||
                    !/[a-zA-Z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                    return Response.json({ error: 'Password must be 8-30 characters and contain a letter, number, and symbol.' }, { status: 400 })
                }
                const authHeaders = new Headers(headers)
                authHeaders.delete('Content-Profile')
                authHeaders.delete('Accept-Profile')
                const authResponse = await fetchImplementation(`${restApiBase.origin}/auth/v1/user`, {
                    method: 'PUT', headers: authHeaders, body: JSON.stringify({ password }), signal: init?.signal,
                })
                if (!authResponse.ok) {
                    const authError = await authResponse.json().catch(() => ({}))
                    return Response.json({ error: authError.msg ?? authError.message ?? 'Unable to update your password. Please try again.' }, {
                        status: authResponse.status,
                    })
                }
                body = { passwordUpdated: true, waivePassword: Boolean(body.waivePassword), platform: body.platform ?? 'web', status: 'Successful' }
            }
            headers.set('Content-Profile', 'api')
            headers.set('Accept-Profile', 'api')
            const response = await fetchImplementation(`${restApiBase.origin}${restApiBase.pathname}/rpc/wfh_pulse_request`, {
                ...init,
                method: 'POST',
                headers,
                body: JSON.stringify({
                    p_path: routePath,
                    p_method: method.toUpperCase(),
                    p_query: Object.fromEntries(parsedUrl.searchParams),
                    p_body: body,
                }),
            })
            const payload = await response.clone().json().catch(() => null)
            if (!response.ok) {
                return payload ? Response.json({ ...payload, error: payload.error ?? payload.message }, {
                    status: response.status,
                }) : response
            }
            if (!Number.isInteger(payload?.status) || payload.status < 200 || payload.status > 599) {
                return Response.json({ error: 'Unexpected Data API response.' }, { status: 502 })
            }
            if (payload.status === 204) return new Response(null, { status: 204 })
            return Response.json(payload.body ?? {}, { status: payload.status })
        }
        return fetchImplementation(input, { ...init, headers })
    }
}

const env = import.meta.env ?? {}

const rawApiFetch = createApiFetch({
    apiBaseUrls: [env.VITE_API_BASE_URL, env.VITE_API_BASE_URL_ANDROID],
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '',
})

let mobileOffline
let offlineBase
let deviceStore
const statusListeners = new Set()
let offlineStatus = { enabled: false, connected: true, syncing: false, pendingCount: 0, failedCount: 0, error: '', operations: [] }
const emitStatus = value => { offlineStatus = value; for (const listener of statusListeners) listener(value) }
export const getOfflineSyncStatus = () => offlineStatus
export const subscribeOfflineSync = listener => { statusListeners.add(listener); return () => { statusListeners.delete(listener) } }
export const retryOfflineSync = () => mobileOffline?.sync(true)
export const discardOfflineOperation = id => mobileOffline?.discard(id)
export const apiFetch = (input, init) => mobileOffline ? mobileOffline.fetch(input, init) : rawApiFetch(input, init)
export async function configureMobileOfflineSession({ baseUrl, accountId, accessToken, refreshSession }) {
    if (mobileOffline?.accountId === accountId && offlineBase === baseUrl) {
        mobileOffline.updateToken(accessToken)
        return
    }
    await mobileOffline?.stop()
    deviceStore ??= createOfflineStore()
    const scope = `${new URL(baseUrl.replace(/\/+$/, '')).href}|${accountId}`
    const saved = await deviceStore.read(scope)
    let supported = saved.serverSupportsOffline === true
    if (globalThis.navigator?.onLine !== false) {
        try {
            const response = await rawApiFetch(`${baseUrl}/me/offline-sync/capabilities`, {
                headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000),
            })
            if (response.ok && (await response.json()).offlineSync === true) {
                supported = true
                await deviceStore.update(scope, state => { state.serverSupportsOffline = true })
            }
        } catch { /* A previously verified server can still be used offline. */ }
    }
    if (!supported) throw new Error('Production offline sync has not been enabled for this device.')
    mobileOffline = createOfflineSync({ baseUrl, accountId, accessToken, refreshSession, store: deviceStore,
        fetchImplementation: rawApiFetch, onStatus: emitStatus,
        onSynced: () => {
            for (const event of ['offline-synced', 'leave-updated', 'overtime-updated']) {
                globalThis.dispatchEvent?.(new CustomEvent(`wfh-pulse:${event}`))
            }
        },
    })
    offlineBase = baseUrl
    try { await mobileOffline.start() }
    catch (error) {
        await mobileOffline.stop()
        mobileOffline = undefined; offlineBase = undefined
        throw error
    }
}
export async function clearMobileOfflineSession() {
    await mobileOffline?.stop()
    mobileOffline = undefined; offlineBase = undefined
    emitStatus({ enabled: false, connected: true, syncing: false, pendingCount: 0, failedCount: 0, error: '', operations: [] })
}
