function normalizeWebhookUrl(value) {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : ''
}

function formatDatePart(value) {
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10)
    }

    const text = String(value ?? '').trim()
    return text ? text.slice(0, 10) : 'unknown-date'
}

function formatTimePart(value) {
    const text = String(value ?? '').trim()
    return text ? text.slice(0, 5) : '--:--'
}

function formatStatus(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return 'Unknown'
    }

    const normalized = text.toLowerCase()
    if (normalized === 'present') {
        return 'Present'
    }
    if (normalized === 'absent') {
        return 'Absent'
    }
    if (normalized === 'late') {
        return 'Late'
    }

    return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`
}

function getActionLabel(action) {
    if (action === 'clock_out') {
        return 'Clock-out'
    }

    return 'Clock-in'
}

export function createSlackAttendanceNotifier({
    webhookUrl,
    channel,
    username,
    iconEmoji,
    fetchImpl = globalThis.fetch,
} = {}) {
    const resolvedWebhookUrl = normalizeWebhookUrl(webhookUrl)
    const resolvedChannel = String(channel ?? '').trim()
    const resolvedUsername =
        String(username ?? '').trim() || 'WFH-PULSE Attendance Bot'
    const resolvedIconEmoji = String(iconEmoji ?? '').trim() || ':alarm_clock:'

    const hasFetch = typeof fetchImpl === 'function'
    const enabled = Boolean(resolvedWebhookUrl) && hasFetch

    return {
        enabled,
        async notifySlackAttendanceEvent({
            action,
            employeeId,
            userId,
            employeeName,
            position,
            attendanceDate,
            eventTime,
            status,
        }) {
            if (!enabled) {
                return false
            }

            const safeAction =
                action === 'clock_out' || action === 'clock_in'
                    ? action
                    : 'clock_in'
            const actionLabel = getActionLabel(safeAction)
            const datePart = formatDatePart(attendanceDate)
            const timePart = formatTimePart(eventTime)
            const safeEmployeeName = String(employeeName ?? '').trim()
            const safePosition = String(position ?? '').trim()
            const nameAndPosition = safeEmployeeName
                ? `${safeEmployeeName} - ${safePosition || 'Employee'}`
                : `Employee ${String(employeeId ?? 'unknown')} - ${safePosition || 'Employee'}`

            const payload = {
                text: `${actionLabel} : ${timePart} ${datePart}\n${nameAndPosition}\n${formatStatus(status)}`,
                username: resolvedUsername,
                icon_emoji: resolvedIconEmoji,
            }

            if (resolvedChannel) {
                payload.channel = resolvedChannel
            }

            void userId

            const response = await fetchImpl(resolvedWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            if (!response.ok) {
                const error = new Error(
                    `Slack webhook request failed (${response.status})`
                )
                error.httpStatus = Number(response.status)
                throw error
            }

            return {
                ok: true,
                httpStatus: Number(response.status),
                payload,
            }
        },
    }
}