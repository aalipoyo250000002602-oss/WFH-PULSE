export const dayKey = value => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value))
const timeKey = value => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))
export const isAttendance = path => /^\/me\/attendance\/(clock-in|clock-out|break\/(start|end))$/.test(path)
export const isQueueable = (path, method) =>
    (method === 'POST' && isAttendance(path)) ||
    (method === 'POST' && /^\/me\/(leave-requests|attendance-adjustments|overtime-requests)$/.test(path)) ||
    (['PUT','DELETE'].includes(method) && /^\/me\/(leave-requests|attendance-adjustments|overtime-requests)\/[^/]+$/.test(path)) ||
    (method === 'POST' && /^\/me\/(leave-requests|attendance-adjustments|overtime-requests)\/[^/]+\/(cancel|revoke)$/.test(path))
export function cacheKey(path, search = '') {
    const query = new URLSearchParams(search)
    for (const key of ['t', '_', 'timestamp']) query.delete(key)
    query.sort()
    return path + (query.size ? `?${query}` : '')
}
function sessionMinutes(state, a, logs, date, currentTime) {
    const scheduleRows = state.cache['/settings/company-working-hours']?.workingHours ?? []
    const isoDay = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
    const schedule = scheduleRows.find(row => Number(row.iso_day ?? row.isoDay) === isoDay)
    const minute = value => { const [h,m] = String(value).split(':').map(Number); return h * 60 + m }
    const start = Math.max(minute(a.clockIn), minute(schedule?.start_time ?? '09:00'))
    const finish = Math.min(minute(a.clockOut ?? timeKey(currentTime)), minute(schedule?.end_time ?? '18:00'))
    let breakStart
    let breaks = 0
    for (const log of [...(logs ?? [])].sort((x,y) => Date.parse(x.loggedAt) - Date.parse(y.loggedAt))) {
        if (log.action === 'break_start') breakStart = minute(timeKey(log.loggedAt))
        if (log.action === 'break_end' && breakStart !== undefined) {
        breaks += Math.max(0, Math.min(finish, minute(timeKey(log.loggedAt))) - Math.max(start, breakStart))
        breakStart = undefined
        }
    }
    if (breakStart !== undefined) breaks += Math.max(0, finish - Math.max(start, breakStart))
    return schedule?.is_working_day === false ? 0 : Math.max(0, finish - start - breaks)
}

export function projectAttendance(state, date = dayKey(Date.now()), base, currentTime = new Date().toISOString()) {
    const result = structuredClone(base ?? state.cache['/me/attendance/today'] ?? { attendance: null, logs: [], currentWorkDurationMinutes: 0 })
    if (result.attendance?.attendanceDate !== date) {
        result.attendance = null; result.logs = []; result.currentWorkDurationMinutes = 0
    }
    for (const op of state.operations.filter(op => isAttendance(op.path) && dayKey(op.occurredAt) === date)) {
        const previous = result.attendance ?? { attendanceDate: date, status: 'present', workDurationMinutes: 0, lateMinutes: 0, totalBreakDurationMinutes: 0 }
        const a = { ...previous, syncStatus: op.error ? 'failed' : 'pending' }
        if (op.path.endsWith('/clock-in')) { a.clockIn = timeKey(op.occurredAt); a.clockOut = null; a.isBreakActive = false }
        if (op.path.endsWith('/clock-out')) { a.clockOut = timeKey(op.occurredAt); a.isBreakActive = false }
        if (op.path.endsWith('/break/start')) { a.isBreakActive = true; a.activeBreakStartedAt = op.occurredAt }
        if (op.path.endsWith('/break/end')) {
            a.totalBreakDurationMinutes += Math.max(0, Math.floor((Date.parse(op.occurredAt) - Date.parse(a.activeBreakStartedAt)) / 60000)) || 0
            a.isBreakActive = false; a.activeBreakStartedAt = null
        }
        result.attendance = a
        const action = op.path.endsWith('/clock-in') ? 'clock_in' : op.path.endsWith('/clock-out') ? 'clock_out' : op.path.endsWith('/start') ? 'break_start' : 'break_end'
        result.logs = [...(result.logs ?? []), { activityId: -Number(op.sequence), action, loggedAt: op.occurredAt, syncStatus: a.syncStatus }]
        if (op.path.endsWith('/clock-out')) a.workDurationMinutes = Number(previous.workDurationMinutes ?? 0) +
            sessionMinutes(state, a, result.logs, date, op.occurredAt)
    }
    const a = result.attendance
    if (a?.clockIn) {
        result.currentWorkDurationMinutes = Number(a.workDurationMinutes ?? 0) +
            (a.clockOut ? 0 : sessionMinutes(state, a, result.logs ?? [], date, currentTime))
    }
    return result
}
export function localRequest(op, aliases = {}) {
    const localId = `offline-${op.operationId}`
    const pathId = op.path.split('/')[3]
    const id = aliases[pathId] ?? pathId ?? aliases[localId] ?? localId
    const status = /\/(cancel)$/.test(op.path) ? 'cancelled' : 'pending'
    const b = op.body
    const result = { ...b, requestId: id, request_id: id, status, syncStatus: op.error ? 'failed' : 'pending',
        requestDate: b.date, shiftDateFrom: b.shiftDateFrom ?? b.date, shiftDateTo: b.shiftDateTo ?? b.date,
        clockInTime: b.clockInTime ?? b.startTime, clockOutTime: b.clockOutTime ?? b.endTime,
        breakDurationMinutes: b.breakDurationMinutes ?? b.breakDuration ?? 0,
        submittedAt: op.occurredAt, submitted_at: op.occurredAt,
        start_date: b.startDate, end_date: b.endDate, leave_type_id: b.leaveTypeId,
        attachments: b.attachments?.map(file => typeof file === 'string' ? { fileName: file } : file),
        logs: [{ status, loggedAt: op.occurredAt }],
    }
    return Object.fromEntries(Object.entries(result).filter(([,value]) => value !== undefined))
}
export function overlayRequests(state, path, base = {}) {
    const result = structuredClone(base)
    const rows = new Map((result.requests ?? []).map(row => [row.requestId ?? row.request_id, row]))
    for (const op of state.operations.filter(op => op.path === path || op.path.startsWith(`${path}/`))) {
        const row = localRequest(op, state.aliases)
        if (op.method === 'DELETE') rows.delete(row.requestId)
        else rows.set(row.requestId, { ...(rows.get(row.requestId) ?? {}), ...row })
    }
    result.requests = [...rows.values()]
    return result
}
