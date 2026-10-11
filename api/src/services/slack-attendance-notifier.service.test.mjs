import test from 'node:test'
import assert from 'node:assert/strict'
import { createSlackAttendanceNotifier } from './slack-attendance-notifier.service.mjs'

test('is disabled when webhook url is missing', async () => {
    const notifier = createSlackAttendanceNotifier({
        webhookUrl: '',
        fetchImpl: async () => {
            throw new Error('fetch should not be called')
        },
    })

    assert.equal(notifier.enabled, false)
    const notified = await notifier.notifySlackAttendanceEvent({
        action: 'clock_in',
        employeeId: 'EMP-1',
        attendanceDate: '2026-10-11',
        eventTime: '09:00',
        status: 'present',
    })

    assert.equal(notified, false)
})

test('posts clock-in payload to slack webhook', async () => {
    let capturedUrl = ''
    let capturedOptions = null

    const notifier = createSlackAttendanceNotifier({
        webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXX',
        channel: '#attendance',
        username: 'WFH Bot',
        iconEmoji: ':calendar:',
        fetchImpl: async (url, options) => {
            capturedUrl = String(url)
            capturedOptions = options
            return { ok: true, status: 200 }
        },
    })

    const notified = await notifier.notifySlackAttendanceEvent({
        action: 'clock_in',
        employeeId: 'EMP-7',
        employeeName: 'Alex Cruz',
        position: 'Software Engineer',
        attendanceDate: '2026-10-11',
        eventTime: '09:15:00',
        status: 'late',
    })

    assert.equal(notifier.enabled, true)
    assert.equal(notified?.ok, true)
    assert.equal(notified?.httpStatus, 200)
    assert.equal(typeof notified?.payload?.text, 'string')
    assert.equal(
        capturedUrl,
        'https://hooks.slack.com/services/T000/B000/XXX'
    )
    assert.equal(capturedOptions?.method, 'POST')

    const body = JSON.parse(String(capturedOptions?.body ?? '{}'))
    assert.equal(body.channel, '#attendance')
    assert.equal(body.username, 'WFH Bot')
    assert.equal(body.icon_emoji, ':calendar:')
    assert.equal(
        body.text,
        'Clock-in : 09:15 2026-10-11\nAlex Cruz - Software Engineer\nLate'
    )
})
