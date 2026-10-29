import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createMobilePushSender, pushData } from './mobile-push.service.mjs'
const job = { platform: 'android', token: 'fixture-private-token', binding_id: 'fixture-binding', notification_id: 'fixture-event',
    request_id: 'fixture-request', request_type: 'leave', event_kind: 'status_changed', request_status: 'approved',
    title: 'Leave request updated', body: 'Your leave request is now approved.' }

test('push data identifies the account binding and request without sensitive request details', () => {
    assert.deepEqual(pushData(job), { notificationId: 'fixture-event', bindingId: 'fixture-binding', requestId: 'fixture-request',
        requestType: 'leave', eventKind: 'status_changed', status: 'approved', page: 'home' })
    assert.equal(pushData({ ...job, event_kind: 'submitted' }).page, 'dashboard')
})

test('FCM sends to a single token, caches OAuth, and drops only explicitly unregistered tokens', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const account = { project_id: 'fixture-project', client_email: 'fixture@example.com',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
    const calls = []
    let fail = false
    const send = createMobilePushSender({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }, async (url, init) => {
        calls.push(url)
        if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'fixture-oauth', expires_in: 3600 })
        const message = JSON.parse(init.body).message
        assert.equal(message.token, job.token)
        assert.equal(message.topic, undefined)
        assert.equal(message.condition, undefined)
        assert.equal(message.data.bindingId, job.binding_id)
        assert.equal(message.android.notification.channel_id, 'request-updates')
        return fail ? Response.json({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 })
            : Response.json({ name: 'fixture-delivery' })
    })
    await send(job); await send(job)
    assert.equal(calls.filter(url => url.includes('oauth2.googleapis.com')).length, 1)
    fail = true
    await assert.rejects(send(job), error => error.invalidToken && error.permanent)
})

test('missing provider credentials do not enable mobile delivery', () => {
    assert.deepEqual(createMobilePushSender({}).configuredPlatforms, [])
})


test('APNs signs token-targeted HTTP/2 alerts with the correct signing environment and account binding', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const env = { APNS_KEY_ID: 'fixture-key', APNS_TEAM_ID: 'fixture-team', APNS_TOPIC: 'com.wfh.pulse',
        APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n') }
    for (const environment of ['sandbox', 'production']) {
        let payload
        const send = createMobilePushSender(env, () => { throw new Error('iOS must not use FCM') }, host => {
            assert.equal(host, environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com')
            const client = new EventEmitter()
            client.destroy = () => {}
            client.request = headers => {
                assert.equal(headers[':path'], `/3/device/${'a'.repeat(64)}`)
                assert.equal(headers['apns-topic'], 'com.wfh.pulse')
                assert.equal(headers['apns-push-type'], 'alert')
                const jwt = headers.authorization.slice(7).split('.')
                assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).kid, 'fixture-key')
                assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).iss, 'fixture-team')
                assert.ok(verify('SHA256', Buffer.from(jwt.slice(0, 2).join('.')),
                    { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(jwt[2], 'base64url')))
                const request = new EventEmitter()
                request.setEncoding = () => {}
                request.close = () => { request.closed = true }
                request.end = body => {
                    payload = JSON.parse(body)
                    queueMicrotask(() => { request.emit('response', { ':status': 200 }); request.emit('end') })
                }
                return request
            }
            queueMicrotask(() => client.emit('connect'))
            return client
        })
        await send({ ...job, platform: 'ios', token: 'a'.repeat(64), apns_environment: environment })
        assert.equal(payload.bindingId, job.binding_id)
        assert.equal(payload.notificationId, job.notification_id)
        assert.deepEqual(payload.aps.alert, { title: job.title, body: job.body })
    }
})
