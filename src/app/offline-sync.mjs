import { cacheKey, dayKey, isAttendance, isQueueable, localRequest, overlayRequests, projectAttendance } from './offline-projection.mjs'
const requestList = /^\/me\/(leave-requests|attendance-adjustments|overtime-requests)$/
const cacheable = path => path.startsWith('/me/') && !/security-preferences|push-devices|offline-sync/.test(path)
    || ['/meta/employment-options','/settings/company-working-hours','/settings/leave-credit-types'].includes(path)
const json = (body, status = 200) => Response.json(body, { status })
const retryable = status => status >= 500 || [408,425,429].includes(status)

export function createOfflineSync({ baseUrl, accountId, accessToken, store, fetchImplementation,
    refreshSession, onStatus = () => {}, onSynced = () => {}, online = () => globalThis.navigator?.onLine !== false,
    now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
    const base = new URL(baseUrl.replace(/\/+$/, ''))
    const scope = `${base.href}|${accountId}`
    const tokens = new Set([accessToken])
    let token = accessToken
    let active = true
    let connected = online()
    let syncing = false
    let running
    let lastError = ''
    let timer
    const results = new Map()
    const route = input => {
        try {
            const url = new URL(input instanceof Request ? input.url : String(input))
            if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)) return null
            return { path: url.pathname.slice(base.pathname.length), url }
        } catch { return null }
    }
    async function publish() {
        const state = await store.read(scope)
        if (active) onStatus({ enabled: true, connected, syncing, pendingCount: state.operations.length,
            failedCount: state.operations.filter(op => op.error).length, error: lastError,
            lastSyncedAt: state.lastSyncedAt, operations: state.operations.map(({ operationId,path,occurredAt,error }) => ({ operationId,path,occurredAt,error })) })
    }
    async function authorized(input, init) {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return fetchImplementation(input, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(12_000) })
    }
    async function renew() {
        if (!active || !refreshSession) return false
        const refreshed = await refreshSession()
        if (!active || !refreshed?.accessToken || refreshed.accountId !== accountId) return false
        token = refreshed.accessToken; tokens.add(token)
        return true
    }
    function mergeRead(state, path, url, payload) {
        if (path === '/me/attendance/today') return projectAttendance(state, dayKey(now()), payload, now())
        if (requestList.test(path)) return overlayRequests(state, path, payload)
        if (path === '/me/calendar') {
            const result = structuredClone(payload ?? { attendance: [], attendanceByDate: {}, holidays: [] })
            for (const date of new Set(state.operations.filter(op => isAttendance(op.path)).map(op => dayKey(op.occurredAt)))) {
                const original = (result.attendance ?? []).find(row => (row.date ?? row.attendanceDate) === date)
                const projected = projectAttendance(state, date, { attendance: original ? { ...original, attendanceDate: date } : null }).attendance
                if (projected) {
                    result.attendance = [...(result.attendance ?? []).filter(row => (row.date ?? row.attendanceDate) !== date), { ...projected, date }]
                    result.attendanceByDate = { ...result.attendanceByDate, [date]: projected.status }
                }
            }
            return result
        }
        return payload
    }
    function commitResult(state, op, payload) {
        if (payload.attendance) {
            const key = '/me/attendance/today'
            const previous = state.cache[key] ?? { logs: [] }
            state.cache[key] = { ...previous, attendance: payload.attendance,
                currentWorkDurationMinutes: payload.attendance.workDurationMinutes ?? 0,
                logs: [...(previous.logs ?? []), { activityId: -op.sequence, action: op.path.endsWith('clock-in') ? 'clock_in'
                    : op.path.endsWith('clock-out') ? 'clock_out' : op.path.endsWith('start') ? 'break_start' : 'break_end', loggedAt: op.occurredAt }] }
        }
        const row = payload.request
        const realId = row?.requestId ?? row?.request_id
        if (realId) state.aliases[`offline-${op.operationId}`] = realId
        const root = op.path.split('/').slice(0, 3).join('/')
        if (requestList.test(root)) {
            for (const key of new Set([root, ...Object.keys(state.cache).filter(key => key.split('?')[0] === root)])) {
                const cached = state.cache[key] ?? { requests: [] }
                let rows = (cached.requests ?? []).filter(item => ![realId, state.aliases[op.path.split('/')[3]] ?? op.path.split('/')[3]].includes(item.requestId ?? item.request_id))
                if (row && op.method !== 'DELETE') rows.push(row)
                state.cache[key] = { ...cached, requests: rows }
            }
        }
    }
    const sync = (retryFailed = false) => {
        if (running) return running
        running = (async () => {
            if (!active) return
            if (retryFailed) await store.update(scope, state => { for (const op of state.operations) delete op.error })
            const snapshot = await store.read(scope)
            if (!snapshot.operations.length) {
                if (!connected && online()) {
                    let probe = await authorized(`${base.href}/me/offline-sync/capabilities`, { method: 'GET' })
                    if (probe.status === 401 && await renew()) probe = await authorized(`${base.href}/me/offline-sync/capabilities`, { method: 'GET' })
                    connected = probe.ok
                }
                await publish(); return
            }
            syncing = true; lastError = ''; await publish()
            let changed = false
            let attendanceBlocked = false
            for (const original of snapshot.operations) {
                if (!active) break
                if (original.error) { if (isAttendance(original.path)) attendanceBlocked = true; continue }
                if (attendanceBlocked && isAttendance(original.path)) continue
                const state = await store.read(scope)
                if (!state.operations.some(item => item.operationId === original.operationId)) continue
                let path = original.path
                const localId = path.split('/')[3]
                if (localId?.startsWith('offline-')) {
                    if (!state.aliases[localId]) continue
                    path = path.replace(localId, state.aliases[localId])
                }
                const body = { operationId: original.operationId, path, method: original.method, body: original.body, occurredAt: original.occurredAt }
                let response = await authorized(`${base.href}/me/offline-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                if (response.status === 401 && await renew()) response = await authorized(`${base.href}/me/offline-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                const payload = await response.json().catch(() => ({}))
                connected = true
                if (response.status === 401) { lastError = 'Sign in again to sync your saved actions.'; break }
                if (response.status === 404) { lastError = 'Production sync is unavailable. Your saved actions are still on this device.'; break }
                if (retryable(response.status)) { lastError = 'Sync is temporarily unavailable. Saved actions will retry.'; break }
                results.set(original.operationId, { body: payload, status: response.status })
                if (results.size > 100) results.delete(results.keys().next().value)
                if (!response.ok) {
                    const error = typeof payload.error === 'string' ? payload.error : 'Production rejected this saved action. Review it before retrying.'
                    await store.update(scope, state => { const op = state.operations.find(item => item.operationId === original.operationId); if (op) op.error = error })
                    if (isAttendance(original.path)) attendanceBlocked = true
                    continue
                }
                await store.update(scope, state => {
                    commitResult(state, original, payload)
                    state.operations = state.operations.filter(item => item.operationId !== original.operationId)
                    state.lastSyncedAt = now()
                })
                changed = true
            }
            if (changed && active) onSynced()
        })().catch(() => { connected = false; lastError = 'Saved on this device. Sync will retry when the connection returns.' })
            .finally(async () => { syncing = false; running = undefined; await publish().catch(() => {}) })
        return running
    }
    async function fetchOffline(input, init = {}) {
        const target = route(input)
        if (!target || !active) return fetchImplementation(input, init)
        const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
        const supplied = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).get('Authorization')
        if (supplied && !tokens.has(supplied.replace(/^Bearer /, ''))) {
            return isQueueable(target.path, method) ? json({ error: 'The signed-in account changed. Reopen this action.' }, 401) : fetchImplementation(input, init)
        }
        if (isQueueable(target.path, method)) {
            let body
            try { body = JSON.parse(String(init.body || '{}')) } catch { return json({ error: 'Invalid request body.' }, 400) }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body.' }, 400)
            const op = { operationId: uuid(), path: target.path, method, body, occurredAt: now() }
            try {
                await store.update(scope, state => {
                    op.sequence = Math.max(Date.now(), (state.operations.at(-1)?.sequence ?? 0) + 1)
                    if (isAttendance(op.path)) {
                        const attendance = projectAttendance(state, dayKey(op.occurredAt), undefined, op.occurredAt).attendance
                        const activeShift = attendance?.clockIn && !attendance?.clockOut
                        if (op.path.endsWith('clock-in') && activeShift) throw new Error('Clock-in is already recorded for this date.')
                        if (!op.path.endsWith('clock-in') && !activeShift) throw new Error('Clock in before recording this action.')
                        if (op.path.endsWith('clock-out') && attendance?.isBreakActive) throw new Error('End your break before clocking out.')
                        if (op.path.endsWith('/start') && attendance?.isBreakActive) throw new Error('A break is already active.')
                        if (op.path.endsWith('/end') && !attendance?.isBreakActive) throw new Error('No break is active.')
                    }
                    state.operations.push(op)
                })
            } catch (error) { return json({ error: error.message || 'Unable to save on this device. No action was recorded.' }, 400) }
            await publish()
            if (online() && connected) await sync()
            const result = results.get(op.operationId)
            if (result) return json(result.body, result.status)
            const state = await store.read(scope)
            const payload = isAttendance(op.path) ? projectAttendance(state, dayKey(op.occurredAt), undefined, op.occurredAt) : { request: localRequest(op, state.aliases), deleted: method === 'DELETE', cancelled: op.path.endsWith('/cancel'), revoked: op.path.endsWith('/revoke') }
            return json({ ...payload, queued: true, syncOperationId: op.operationId }, 202)
        }
        if (method !== 'GET' || !cacheable(target.path)) return fetchImplementation(input, init)
        const key = cacheKey(target.path, target.url.search)
        let payload
        if (online() && connected) {
            try {
                let response = await authorized(input, init)
                if (response.status === 401 && await renew()) response = await authorized(input, init)
                if (!response.ok) {
                    if (!retryable(response.status)) return response
                } else {
                    if (!active) return json({ error: 'The account changed. Reopen this page.' }, 401)
                    payload = await response.json(); connected = true
                    await store.update(scope, state => {
                        state.cache[key] = payload
                        const pinned = ['/me/attendance/today', '/me/profile', '/settings/company-working-hours', '/meta/employment-options', '/settings/leave-credit-types']
                        while (Object.keys(state.cache).length > 80) {
                            const removable = Object.keys(state.cache).find(key => !pinned.includes(key))
                            if (!removable) break
                            delete state.cache[removable]
                        }
                    })
                }
            } catch { connected = false }
        }
        const state = await store.read(scope)
        payload ??= state.cache[key] ?? (requestList.test(target.path) ? { requests: [], leaveTypes: [] }
            : target.path === '/me/attendance/today' ? { attendance: null, logs: [] }
            : target.path === '/me/calendar' ? { attendance: [], attendanceByDate: {}, holidays: [] } : undefined)
        if (payload === undefined) return json({ error: 'This information has not been saved on this device yet.' }, 503)
        void publish().catch(() => {})
        return json(mergeRead(state, target.path, target.url, payload))
    }
    const connectionChanged = () => { connected = online(); void publish(); if (connected) void sync() }
    const resumed = () => { if (globalThis.document?.visibilityState !== 'hidden') void sync() }
    const start = async () => {
        await publish()
        timer = setInterval(() => { void sync() }, 15000)
        globalThis.addEventListener?.('online', connectionChanged); globalThis.addEventListener?.('offline', connectionChanged)
        globalThis.document?.addEventListener('visibilitychange', resumed)
        if (online()) void sync()
    }
    const stop = async () => {
        active = false; clearInterval(timer)
        globalThis.removeEventListener?.('online', connectionChanged); globalThis.removeEventListener?.('offline', connectionChanged)
        globalThis.document?.removeEventListener('visibilitychange', resumed)
        await running
    }
    const discard = async id => {
        await store.update(scope, state => {
            const op = state.operations.find(op => op.operationId === id)
            if (!op) return
            const root = `offline-${id}`
            // Discard dependent local edits too, never leave orphaned writes behind.
            state.operations = state.operations.filter(item => item.operationId !== id && !item.path.includes(root) &&
                !(isAttendance(op.path) && isAttendance(item.path) && dayKey(item.occurredAt) === dayKey(op.occurredAt) && item.sequence >= op.sequence))
        })
        await publish(); if (active) onSynced()
    }
    return { fetch: fetchOffline, sync, start, stop, discard, accountId,
        updateToken(value) { token = value; tokens.add(value) }, status: publish }
}
