import { sign } from 'node:crypto'
import { connect } from 'node:http2'

export class PushDeliveryError extends Error {
    constructor(message, { invalidToken = false, permanent = false } = {}) {
        super(message)
        this.invalidToken = invalidToken
        this.permanent = permanent
    }
}

function jwt(header, payload, key, algorithm) {
    const content = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    const signature = sign(algorithm, Buffer.from(content), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    return `${content}.${signature}`
}

export function pushData(job) {
    return Object.fromEntries(Object.entries({
        notificationId: job.notification_id, bindingId: job.binding_id,
        requestId: job.request_id, requestType: job.request_type,
        eventKind: job.event_kind, status: job.request_status,
        page: job.event_kind === 'status_changed' ? 'home' : 'dashboard',
    }).map(([key, value]) => [key, String(value)]))
}

export function createMobilePushSender(env = process.env, fetchImplementation = fetch, connectImplementation = connect) {
    const account = env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) : null
    if (account && (!account.project_id || !account.client_email || !account.private_key)) {
        throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing required service-account fields.')
    }
    const apnsReady = Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_TOPIC)
    let oauthToken
    let oauthExpires = 0
    let apnsToken
    let apnsExpires = 0
    const configuredPlatforms = [...(account ? ['android'] : []), ...(apnsReady ? ['ios'] : [])]

    async function fcm(job) {
        if (Date.now() >= oauthExpires) {
            const now = Math.floor(Date.now() / 1000)
            const assertion = jwt({ alg: 'RS256', typ: 'JWT' }, {
                iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
                aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
            }, account.private_key, 'RSA-SHA256')
            const response = await fetchImplementation('https://oauth2.googleapis.com/token', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
                signal: AbortSignal.timeout(15_000),
            })
            const body = await response.json()
            if (!response.ok || !body.access_token) throw new PushDeliveryError(`FCM authorization failed (${response.status}).`)
            oauthToken = body.access_token
            oauthExpires = Date.now() + Math.max(0, Number(body.expires_in ?? 3600) - 60) * 1000
        }
        const response = await fetchImplementation(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
            method: 'POST', headers: { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: {
                token: job.token,
                notification: { title: job.title, body: job.body },
                data: pushData(job),
                android: { priority: 'high', ttl: '86400s', notification: { channel_id: 'request-updates', tag: job.notification_id } },
            } }), signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            const invalidToken = body.error?.details?.some(detail => detail.errorCode === 'UNREGISTERED') ?? false
            if (response.status === 401) oauthExpires = 0
            throw new PushDeliveryError(`FCM send failed (${response.status}).`, { invalidToken, permanent: invalidToken })
        }
    }

    async function apns(job) {
        if (!/^[0-9a-f]+$/i.test(job.token)) {
            throw new PushDeliveryError('Invalid APNs device token.', { invalidToken: true, permanent: true })
        }
        if (Date.now() >= apnsExpires) {
            const now = Math.floor(Date.now() / 1000)
            apnsToken = jwt({ alg: 'ES256', kid: env.APNS_KEY_ID }, { iss: env.APNS_TEAM_ID, iat: now },
                env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n'), 'SHA256')
            apnsExpires = Date.now() + 45 * 60_000
        }
        const host = job.apns_environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
        await new Promise((resolve, reject) => {
            const client = connectImplementation(host)
            let settled = false
            let request
            const finish = error => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                if (request && !request.closed) request.close()
                client.destroy()
                if (error) reject(error); else resolve()
            }
            const timer = setTimeout(() => finish(new PushDeliveryError('APNs delivery timed out.')), 15_000)
            client.on('error', () => finish(new PushDeliveryError('APNs connection failed.')))
            client.once('connect', () => {
                try {
                    request = client.request({
                        ':method': 'POST', ':path': `/3/device/${job.token}`,
                        authorization: `bearer ${apnsToken}`, 'apns-topic': env.APNS_TOPIC,
                        'apns-push-type': 'alert', 'apns-priority': '10',
                        'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
                        'apns-id': job.notification_id, 'apns-collapse-id': job.notification_id,
                    })
                } catch {
                    finish(new PushDeliveryError('APNs request configuration is invalid.'))
                    return
                }
                let status
                let body = ''
                request.on('response', headers => { status = headers[':status'] })
                request.setEncoding('utf8')
                request.on('data', chunk => { body += chunk })
                request.on('error', () => finish(new PushDeliveryError('APNs request failed.')))
                request.on('end', () => {
                    if (status === 200) return finish()
                    let reason
                    try { reason = JSON.parse(body).reason } catch {}
                    const invalidToken = ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason)
                    if (reason === 'ExpiredProviderToken') apnsExpires = 0
                    finish(new PushDeliveryError(`APNs send failed (${status ?? 'unknown'}).`, { invalidToken, permanent: invalidToken }))
                })
                request.end(JSON.stringify({ aps: { alert: { title: job.title, body: job.body }, sound: 'default',
                    'thread-id': `request-${job.request_id}` }, ...pushData(job) }))
            })
        })
    }
    const send = async job => {
        if (!configuredPlatforms.includes(job.platform)) throw new PushDeliveryError('Push provider is not configured.')
        return job.platform === 'ios' ? apns(job) : fcm(job)
    }
    send.configuredPlatforms = configuredPlatforms
    return send
}
