import test from 'node:test'
import assert from 'node:assert/strict'
import { createMobilePushSession } from './mobile-push.mjs'

const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture({ permission = 'granted', fetchImplementation } = {}) {
    const listeners = new Map()
    const calls = []
    const received = []
    const opened = []
    const plugin = {
        addListener: async (name, handler) => { listeners.set(name, handler); return { remove: async () => listeners.delete(name) } },
        checkPermissions: async () => ({ receive: permission }),
        requestPermissions: async () => ({ receive: permission }),
        createChannel: async () => calls.push('channel'),
        register: async () => { calls.push('register'); listeners.get('registration')({ value: 'fixture-device-token-only' }) },
        unregister: async () => calls.push('unregister'),
        removeAllDeliveredNotifications: async () => calls.push('clear'),
    }
    const session = createMobilePushSession({
        plugin, platform: 'android', installationId: 'fixture-installation', apiBaseUrl: 'https://api.example.com', accessToken: 'fixture-user-token',
        onReceive: value => received.push(value), onOpen: value => opened.push(value),
        fetchImplementation: fetchImplementation ?? (async (_url, init) => {
            calls.push(init.method)
            assert.equal(init.headers.Authorization, 'Bearer fixture-user-token')
            const body = JSON.parse(init.body)
            assert.equal(body.installationId, 'fixture-installation')
            assert.equal(body.userId, undefined)
            return Response.json({ bindingId: 'fixture-binding' })
        }),
    })
    return { session, listeners, calls, received, opened }
}

test('push registration authenticates the current account; only matching binding events are handled', async () => {
    const f = fixture()
    await f.session.start(); await flush()
    assert.deepEqual(f.calls, ['channel', 'register', 'PUT'])
    for (const bindingId of ['another-account', 'fixture-binding']) {
        const notification = { data: { bindingId, page: 'home' } }
        f.listeners.get('pushNotificationReceived')(notification)
        f.listeners.get('pushNotificationActionPerformed')({ notification })
    }
    assert.equal(f.received.length, 1)
    assert.equal(f.opened.length, 1)
    await f.session.stop()
    assert.ok(f.calls.includes('DELETE'))
    assert.ok(f.calls.includes('unregister'))
    assert.ok(f.calls.includes('clear'))
    assert.equal(f.listeners.size, 0)
})

test('denied device permission never registers or uploads a token', async () => {
    const f = fixture({ permission: 'denied' })
    await f.session.start(); await flush()
    assert.deepEqual(f.calls, [])
    await f.session.stop()
})

test('logout waits for an in-flight registration, removes it, and ignores late callbacks', async () => {
    let finishPut
    const requests = []
    const f = fixture({ fetchImplementation: async (_url, init) => {
        requests.push(init.method)
        if (init.method === 'PUT') await new Promise(resolve => { finishPut = resolve })
        return Response.json({ bindingId: 'fixture-binding' })
    } })
    await f.session.start(); await flush()
    const lateCallback = f.listeners.get('registration')
    const stop = f.session.stop()
    lateCallback({ value: 'late-token-from-previous-account' })
    finishPut(); await stop; await flush()
    assert.deepEqual(requests, ['PUT', 'DELETE'])
    await f.session.stop()
    assert.deepEqual(requests, ['PUT', 'DELETE'])
})

test('server cleanup errors still unregister native push and clear delivered notifications', async () => {
    const f = fixture({ fetchImplementation: async (_url, init) => {
        if (init.method === 'DELETE') throw new Error('offline')
        return Response.json({ bindingId: 'fixture-binding' })
    } })
    await f.session.start(); await flush()
    await assert.rejects(f.session.stop(), /offline/)
    assert.ok(f.calls.includes('unregister'))
    assert.ok(f.calls.includes('clear'))
    assert.equal(f.listeners.size, 0)
})


test('a cold-start notification tap waits for account binding before navigation', async () => {
    let finishRegistration
    const f = fixture({ fetchImplementation: async (_url, init) => {
        if (init.method === 'PUT') await new Promise(resolve => { finishRegistration = resolve })
        return Response.json({ bindingId: 'fixture-binding' })
    } })
    await f.session.start(); await flush()
    f.listeners.get('pushNotificationActionPerformed')({ notification: { data: { bindingId: 'previous-account', page: 'dashboard' } } })
    f.listeners.get('pushNotificationActionPerformed')({ notification: { data: { bindingId: 'fixture-binding', page: 'home' } } })
    assert.equal(f.opened.length, 0)
    finishRegistration(); await flush()
    assert.deepEqual(f.opened, [{ bindingId: 'fixture-binding', page: 'home' }])
    await f.session.stop()
})
