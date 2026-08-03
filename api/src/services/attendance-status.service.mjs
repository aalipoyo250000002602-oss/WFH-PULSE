const FULL_DAY_MINUTES = 8 * 60
const LATE_THRESHOLD_MINUTES = 15

function toSafeMinutes(value) {
    const minutes = Number(value ?? 0)
    if (!Number.isFinite(minutes)) {
        return 0
    }
    return Math.max(0, Math.floor(minutes))
}

export function resolveAttendanceStatus({
    workDurationMinutes,
    lateMinutes,
    clockIn,
    clockOut,
}) {
    const totalMinutes = toSafeMinutes(workDurationMinutes)
    const lateTotalMinutes = toSafeMinutes(lateMinutes)

    if (!clockIn && totalMinutes === 0) {
        return 'absent'
    }

    if (clockIn && !clockOut) {
        return 'present'
    }

    if (totalMinutes < FULL_DAY_MINUTES) {
        return 'absent'
    }

    if (lateTotalMinutes >= LATE_THRESHOLD_MINUTES) {
        return 'late'
    }

    return 'present'
}

export function getAutoCloseShiftValues({ lateMinutes }) {
    const lateTotalMinutes = toSafeMinutes(lateMinutes)

    return {
        clockOut: '23:59',
        workDurationMinutes: FULL_DAY_MINUTES,
        status: lateTotalMinutes >= LATE_THRESHOLD_MINUTES ? 'late' : 'present',
    }
}

export const attendanceStatusRules = {
    fullDayMinutes: FULL_DAY_MINUTES,
    lateThresholdMinutes: LATE_THRESHOLD_MINUTES,
}
