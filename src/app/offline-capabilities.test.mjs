import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

async function environment(run) {
    const fetch = globalThis.fetch
    const indexedDB = globalThis.indexedDB
    const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
    globalThis.indexedDB = new IDBFactory()
    try { await run() }
    finally {
        globalThis.fetch = fetch
        globalThis.indexedDB = indexedDB
        if (navigator) Object.defineProperty(globalThis, 'navigator', navigator)
        else delete globalThis.navigator
    }
}

test('before the database migration, normal online clock actions retain their existing endpoint', async () => {
    await environment(async () => {
        const paths = []
        globalThis.fetch = async input => {
            paths.push(String(input))
            return String(input).endsWith('/capabilities') ? Response.json({ error: 'Unknown route' }, { status: 404 }) : Response.json({ attendance: {} }, { status: 201 })
        }
        const api = await import(`./api-fetch.mjs?capabilities-missing=${Date.now()}`)
        await assert.rejects(api.configureMobileOfflineSession({ baseUrl: 'https://example.supabase.co/rest/v1', accountId: 'employee-a', accessToken: 'fixture' }), /not been enabled/)
        const result = await api.apiFetch('https://example.supabase.co/rest/v1/me/attendance/clock-in', { method: 'POST' })
        assert.equal(result.status, 201)
        assert.ok(paths.at(-1).endsWith('/me/attendance/clock-in'))
        assert.equal(api.getOfflineSyncStatus().enabled, false)
    })
})

test('verified capability and unsynced actions survive sign-out and offline reconfiguration for the same account', async () => {
    await environment(async () => {
        let networkCalls = 0
        globalThis.fetch = async () => { networkCalls++; return Response.json({ offlineSync: true }) }
        const api = await import(`./api-fetch.mjs?capabilities-enabled=${Date.now()}`)
        const options = { baseUrl: 'https://example.supabase.co/rest/v1', accountId: 'employee-a', accessToken: 'fixture' }
        try {
            await api.configureMobileOfflineSession(options)
            globalThis.navigator.onLine = false
            const result = await api.apiFetch(`${options.baseUrl}/me/attendance/clock-in`, {
                method: 'POST', headers: { Authorization: 'Bearer fixture' },
            })
            assert.equal(result.status, 202)
            await api.clearMobileOfflineSession()
            const calls = networkCalls
            await api.configureMobileOfflineSession(options)
            assert.equal(networkCalls, calls)
            assert.equal(api.getOfflineSyncStatus().pendingCount, 1)
            const today = await (await api.apiFetch(`${options.baseUrl}/me/attendance/today`, {
                headers: { Authorization: 'Bearer fixture' },
            })).json()
            assert.ok(today.attendance.clockIn)
        } finally { await api.clearMobileOfflineSession() }
    })
})
