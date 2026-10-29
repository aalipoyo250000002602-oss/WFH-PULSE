import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { createOfflineStore } from './offline-store.mjs'
import { createOfflineSync } from './offline-sync.mjs'

const base = 'https://example.supabase.co/rest/v1'
const scope = `${base}|employee-a`
test('IndexedDB persists actions across store connections and serializes concurrent transactions', async () => {
    const indexedDB = new IDBFactory()
    const first = createOfflineStore(indexedDB), second = createOfflineStore(indexedDB)
    await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).update(scope, state => {
        state.operations.push({ operationId: `op-${index}` })
    })))
    const restored = createOfflineStore(indexedDB)
    assert.equal((await restored.read(scope)).operations.length, 20)
    assert.equal((await restored.read(`${base}|employee-b`)).operations.length, 0)
    await assert.rejects(restored.update(scope, state => { state.operations.push({ operationId: 'must-not-save' }); throw new Error('Invalid action') }), /Invalid action/)
    assert.equal((await first.read(scope)).operations.length, 20)
})

test('real IndexedDB queue recovery replays an attendance action only under its original account', async () => {
    const indexedDB = new IDBFactory()
    let deliveries = 0
    const options = { baseUrl: base, accountId: 'employee-a', accessToken: 'fixture-token', online: () => false,
        now: () => '2026-10-29T01:00:00Z', onStatus: () => {}, fetchImplementation: async () => { deliveries++; return Response.json({ ok: true }) } }
    const first = createOfflineSync({ ...options, store: createOfflineStore(indexedDB) })
    const saved = await first.fetch(`${base}/me/attendance/clock-in`, { method: 'POST', headers: { Authorization: 'Bearer fixture-token' } })
    assert.equal(saved.status, 202)
    await first.stop()
    const other = createOfflineSync({ ...options, accountId: 'employee-b', store: createOfflineStore(indexedDB) })
    await other.sync(); assert.equal(deliveries, 0)
    const restored = createOfflineSync({ ...options, store: createOfflineStore(indexedDB) })
    await restored.sync()
    assert.equal(deliveries, 1)
    assert.equal((await createOfflineStore(indexedDB).read(scope)).operations.length, 0)
})
