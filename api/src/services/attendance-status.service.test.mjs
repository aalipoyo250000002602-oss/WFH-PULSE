import test from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveAttendanceStatus,
    getAutoCloseShiftValues,
    attendanceStatusRules,
} from './attendance-status.service.mjs'

test('2-hour work duration remains absent', () => {
    const status = resolveAttendanceStatus({
        workDurationMinutes: 120,
        lateMinutes: 0,
        clockIn: '09:00',
        clockOut: '11:00',
    })

    assert.equal(status, 'absent')
})

test('8-hour work duration and late >= 15 is late', () => {
    const status = resolveAttendanceStatus({
        workDurationMinutes: 480,
        lateMinutes: 16,
        clockIn: '09:16',
        clockOut: '17:16',
    })

    assert.equal(status, 'late')
})

test('no clock-in and no duration is absent', () => {
    const status = resolveAttendanceStatus({
        workDurationMinutes: 0,
        lateMinutes: 0,
        clockIn: null,
        clockOut: null,
    })

    assert.equal(status, 'absent')
})

test('missed clock-out auto-closes at 23:59 with 8 hours', () => {
    const closed = getAutoCloseShiftValues({ lateMinutes: 0 })

    assert.equal(closed.clockOut, '23:59')
    assert.equal(
        closed.workDurationMinutes,
        attendanceStatusRules.fullDayMinutes
    )
    assert.equal(closed.status, 'present')
})

test('missed clock-out keeps late status when late >= 15', () => {
    const closed = getAutoCloseShiftValues({
        lateMinutes: attendanceStatusRules.lateThresholdMinutes,
    })

    assert.equal(closed.status, 'late')
})
