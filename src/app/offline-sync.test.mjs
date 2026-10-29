import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createOfflineSync } from './offline-sync.mjs'
import { cacheKey, isQueueable } from './offline-projection.mjs'
import { createOfflineSessionVault } from './offline-session.mjs'

function memoryStore() {
    const states = new Map()
    let pending = Promise.resolve()
    const empty = () => ({ operations: [], cache: {}, aliases: {}, lastSyncedAt: null })
    return {
        read: async key => { await pending.catch(() => {}); return structuredClone(states.get(key) ?? empty()) },
        update: (key, change) => {
            const next = pending.catch(() => {}).then(() => {
                const state = structuredClone(states.get(key) ?? empty())
                change(state); states.set(key, state); return structuredClone(state)
            })
            pending = next; return next
        },
        states,
    }
}
function fixture({ store = memoryStore(), account = 'employee-a', transport, refreshSession, initialOnline = false } = {}) {
    const online = { value: initialOnline }
    const time = { value: '2026-10-29T01:00:00.000Z' }
    const statuses = []
    const calls = []
    const engine = createOfflineSync({ baseUrl: 'https://example.supabase.co/rest/v1', accountId: account,
        accessToken: `${account}-secret-token`, store, online: () => online.value, now: () => time.value, uuid: randomUUID,
        refreshSession, onStatus: state => statuses.push(state), fetchImplementation: async (url, init) => {
            calls.push({ url, init })
            if (transport) return transport(url, init)
            const operation = JSON.parse(init.body || '{}')
            if (operation.path) return Response.json({ request: { requestId: `server-${operation.operationId}`, status: 'pending' } })
            return Response.json({ attendance: null, logs: [] })
        },
    })
    const request = (path, method = 'POST', body = {}) => engine.fetch(`https://example.supabase.co/rest/v1${path}`, {
        method, headers: { Authorization: `Bearer ${account}-secret-token` }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    })
    return { engine, request, online, time, statuses, calls, store, scope: `https://example.supabase.co/rest/v1|${account}` }
}

test('offline clock-in, break, and clock-out are durable, ordered, visible, and contain no credentials', async () => {
    const f = fixture()
    assert.equal((await f.request('/me/attendance/clock-in')).status, 202)
    f.time.value = '2026-10-29T04:00:00.000Z'; await f.request('/me/attendance/break/start')
    f.time.value = '2026-10-29T05:00:00.000Z'; await f.request('/me/attendance/break/end')
    f.time.value = '2026-10-29T10:00:00.000Z'; await f.request('/me/attendance/clock-out')
    const today = await (await f.request('/me/attendance/today', 'GET')).json()
    assert.equal(today.attendance.clockIn, '09:00')
    assert.equal(today.attendance.clockOut, '18:00')
    assert.equal(today.attendance.totalBreakDurationMinutes, 60)
    assert.equal(today.currentWorkDurationMinutes, 480)
    assert.deepEqual(today.logs.map(log => log.action), ['clock_in','break_start','break_end','clock_out'])
    const state = await f.store.read(f.scope)
    assert.equal(state.operations.length, 4)
    assert.ok(!JSON.stringify(state).includes('secret-token'))
    assert.equal(f.calls.length, 0)
    await f.engine.sync()
    assert.equal(f.calls.length, 4)
    assert.deepEqual(f.calls.map(call => JSON.parse(call.init.body).occurredAt), state.operations.map(op => op.occurredAt))
    assert.equal((await f.store.read(f.scope)).operations.length, 0)
    assert.equal(f.statuses.at(-1).pendingCount, 0)
})

test('a lost response retries the same operation after app restart instead of creating another event', async () => {
    const store = memoryStore()
    const receipts = new Map()
    let changes = 0
    let loseResponse = true
    const transport = async (_url, init) => {
        const op = JSON.parse(init.body)
        if (!receipts.has(op.operationId)) { changes++; receipts.set(op.operationId, { request: { requestId: 'server-request' } }) }
        if (loseResponse) { loseResponse = false; throw new TypeError('network lost after commit') }
        return Response.json(receipts.get(op.operationId))
    }
    const first = fixture({ store, transport })
    await first.request('/me/leave-requests', 'POST', { message: 'Annual leave' })
    await first.engine.sync()
    assert.equal((await store.read(first.scope)).operations.length, 1)
    await first.engine.stop()
    const restored = fixture({ store, transport })
    await restored.engine.sync()
    assert.equal(changes, 1)
    assert.equal((await store.read(first.scope)).operations.length, 0)
})

test('accounts and production hosts have separate queues; mismatched credentials cannot enqueue', async () => {
    const store = memoryStore()
    const a = fixture({ store }); const b = fixture({ store, account: 'employee-b' })
    await a.request('/me/attendance/clock-in')
    await b.engine.sync()
    assert.equal(b.calls.length, 0)
    assert.equal((await store.read(a.scope)).operations.length, 1)
    const denied = await b.engine.fetch('https://example.supabase.co/rest/v1/me/attendance/clock-out', {
        method: 'POST', headers: { Authorization: 'Bearer employee-a-secret-token' },
    })
    assert.equal(denied.status, 401)
    assert.equal((await store.read(b.scope)).operations.length, 0)
})

test('local request IDs are reconciled before dependent edits are replayed', async () => {
    const f = fixture()
    const create = await (await f.request('/me/attendance-adjustments', 'POST', { date: '2026-10-29', message: 'Original request' })).json()
    await f.request(`/me/attendance-adjustments/${create.request.requestId}`, 'PUT', { date: '2026-10-29', message: 'Edited offline' })
    const local = await (await f.request('/me/attendance-adjustments?sourcePage=all', 'GET')).json()
    // The request helper accepts paths containing query strings.
    assert.equal(local.requests.length, 1)
    assert.equal(local.requests[0].message, 'Edited offline')
    await f.engine.sync()
    const sent = f.calls.map(call => JSON.parse(call.init.body))
    assert.equal(sent.length, 2)
    assert.ok(sent[1].path.includes(`server-${sent[0].operationId}`))
    assert.equal((await f.store.read(f.scope)).operations.length, 0)
})

test('server conflicts remain visible and block dependent attendance; independent requests can still sync', async () => {
    const f = fixture({ transport: async (_url, init) => {
        const op = JSON.parse(init.body)
        return op.path.includes('/attendance/') ? Response.json({ error: 'Newer attendance exists' }, { status: 409 })
            : Response.json({ request: { requestId: 'accepted-leave' } })
    } })
    await f.request('/me/attendance/clock-in')
    f.time.value = '2026-10-29T10:00:00.000Z'; await f.request('/me/attendance/clock-out')
    await f.request('/me/leave-requests', 'POST', { message: 'Annual leave' })
    await f.engine.sync()
    const state = await f.store.read(f.scope)
    assert.equal(state.operations.length, 2)
    assert.equal(state.operations[0].error, 'Newer attendance exists')
    assert.equal(f.calls.length, 2)
    assert.equal(f.statuses.at(-1).failedCount, 1)
})

test('token renewal retries with the same operation ID and never switches to another user', async () => {
    let count = 0
    const f = fixture({ refreshSession: async () => ({ accountId: 'employee-a', accessToken: 'renewed-token' }),
        transport: async (_url, init) => ++count === 1 ? Response.json({}, { status: 401 }) : Response.json({ ok: true }) })
    await f.request('/me/leave-requests', 'POST', { message: 'Leave' }); await f.engine.sync()
    assert.equal(f.calls.length, 2)
    assert.equal(f.calls[1].init.headers.get('Authorization'), 'Bearer renewed-token')
    assert.equal(JSON.parse(f.calls[0].init.body).operationId, JSON.parse(f.calls[1].init.body).operationId)
    const other = fixture({ refreshSession: async () => ({ accountId: 'employee-b', accessToken: 'other-token' }),
        transport: async () => Response.json({}, { status: 401 }) })
    await other.request('/me/leave-requests', 'POST', { message: 'Leave' }); await other.engine.sync()
    assert.equal(other.calls.length, 1)
    assert.equal((await other.store.read(other.scope)).operations.length, 1)
})

test('storage failures never acknowledge an attendance action as saved', async () => {
    const f = fixture({ store: { read: async () => ({}), update: async () => { throw new Error('Device storage is full') } } })
    const result = await f.request('/me/attendance/clock-in')
    assert.equal(result.ok, false)
    assert.equal((await result.json()).error, 'Device storage is full')
    assert.equal(f.calls.length, 0)
})

test('cached reads retain unsynced attendance even when the server still reports the previous state', async () => {
    const f = fixture({ initialOnline: true, transport: async () => Response.json({ attendance: null, logs: [] }) })
    f.online.value = false
    await f.request('/me/attendance/clock-in')
    f.online.value = true
    const result = await (await f.request('/me/attendance/today', 'GET')).json()
    assert.equal(result.attendance.clockIn, '09:00')
    assert.equal((await f.store.read(f.scope)).operations.length, 1)
})

test('only self-service attendance and request operations can be queued', () => {
    for (const path of ['/hr/leave-requests/1/approve', '/me/security-preferences/password', '/me/profile', '/auth/login']) {
        assert.equal(isQueueable(path, 'POST'), false)
    }
    assert.equal(cacheKey('/me/calendar', '?t=123&month=2026-10'), '/me/calendar?month=2026-10')
})

test('secure session writes are serialized so logout cannot be undone by a delayed save', async () => {
    let saved
    const vault = createOfflineSessionVault({ key: 'fixture', keychainAccess: 1, storage: {
        set: async (_key, value) => { await new Promise(resolve => setImmediate(resolve)); saved = value },
        get: async () => saved, remove: async () => { saved = null },
    } })
    const saving = vault.remember({ sessionId: 'employee-a' }); const clearing = vault.forget()
    await Promise.all([saving, clearing]); assert.equal(await vault.read(), null)
})


test('after a failed connection, subsequent clock actions are saved immediately until a retry reconnects', async () => {
    let disconnected = true
    const f = fixture({ initialOnline: true, transport: async (_url, init) => {
        if (disconnected) throw new TypeError('Offline despite navigator.onLine')
        return Response.json({ ok: true })
    } })
    assert.equal((await f.request('/me/attendance/clock-in')).status, 202)
    assert.equal(f.calls.length, 1)
    f.time.value = '2026-10-29T10:00:00Z'
    assert.equal((await f.request('/me/attendance/clock-out')).status, 202)
    assert.equal(f.calls.length, 1)
    disconnected = false; await f.engine.sync()
    assert.equal((await f.store.read(f.scope)).operations.length, 0)
})


test('multiple offline clock sessions preserve already completed work minutes', async () => {
    const f = fixture()
    await f.request('/me/attendance/clock-in')
    f.time.value = '2026-10-29T04:00:00Z'; await f.request('/me/attendance/clock-out')
    f.time.value = '2026-10-29T05:00:00Z'; await f.request('/me/attendance/clock-in')
    f.time.value = '2026-10-29T10:00:00Z'; await f.request('/me/attendance/clock-out')
    const today = await (await f.request('/me/attendance/today', 'GET')).json()
    assert.equal(today.currentWorkDurationMinutes, 480)
    assert.equal(today.attendance.workDurationMinutes, 480)
})
