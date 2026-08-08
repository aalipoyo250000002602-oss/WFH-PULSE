import process from 'node:process'
import '../config/env-config.mjs'

const baseUrl =
    process.env.API_BASE_URL ??
    process.env.VITE_API_BASE_URL ??
    process.env.VITE_API_BASE_URL_ANDROID ??
    'http://localhost:8787'

const email = process.env.API_SMOKE_EMAIL ?? 'test@mit.co'
const password = process.env.API_SMOKE_PASSWORD ?? 'testpass'
const strict = process.argv.includes('--strict')

const runId = `smoke-${Date.now()}`

async function requestJson(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options)
    const body = await response.json().catch(() => null)
    return { response, body }
}

async function login() {
    const { response, body } = await requestJson('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })

    if (!response.ok || !body?.accessToken) {
        throw new Error(body?.error ?? 'Login failed for smoke test')
    }

    return body.accessToken
}

async function fetchRequests(accessToken) {
    const { response, body } = await requestJson(
        '/hr/adjustment-requests?sourcePage=dashboard',
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    )

    if (!response.ok) {
        throw new Error(body?.error ?? 'Failed to fetch adjustment requests')
    }

    return Array.isArray(body?.requests) ? body.requests : []
}

async function callAction(accessToken, requestId, action, reason) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
    }

    const options = {
        method: 'POST',
        headers,
    }

    if (typeof reason === 'string') {
        options.headers = {
            ...headers,
            'Content-Type': 'application/json',
        }
        options.body = JSON.stringify({ reason })
    }

    const { response, body } = await requestJson(
        `/hr/adjustment-requests/${encodeURIComponent(requestId)}/${action}`,
        options
    )

    if (!response.ok) {
        throw new Error(body?.error ?? `Failed to ${action} request ${requestId}`)
    }

    return body?.request ?? null
}

function hasLog(request, status, expectedReasonPart) {
    const logs = Array.isArray(request?.logs) ? request.logs : []
    return logs.some(log => {
        if (log?.status !== status) {
            return false
        }
        if (!expectedReasonPart) {
            return true
        }
        const reason = String(log?.reason ?? '')
        return reason.toLowerCase().includes(expectedReasonPart.toLowerCase())
    })
}

async function run() {
    console.log(`Adjustment action smoke test started: ${runId}`)
    console.log(`Base URL: ${baseUrl}`)

    const accessToken = await login()
    console.log(`Logged in as: ${email}`)

    let requests = await fetchRequests(accessToken)
    const pending = requests.filter(item => item.status === 'pending')

    const result = {
        approve: 'skipped',
        deny: 'skipped',
        cancel: 'skipped',
    }

    let approvedFromSmoke = null

    if (pending.length >= 2) {
        const denyTargetId = pending[0].request_id
        const approveTargetId = pending[1].request_id

        const denyReason = `[${runId}] HR denial smoke reason`
        const denied = await callAction(accessToken, denyTargetId, 'deny', denyReason)
        if (
            denied?.status !== 'denied' ||
            !hasLog(denied, 'denied', denyReason)
        ) {
            throw new Error(`Deny verification failed for ${denyTargetId}`)
        }
        result.deny = `passed (${denyTargetId})`

        const approved = await callAction(accessToken, approveTargetId, 'approve')
        if (
            approved?.status !== 'approved' ||
            !hasLog(approved, 'approved', 'Approved by HR')
        ) {
            throw new Error(`Approve verification failed for ${approveTargetId}`)
        }
        result.approve = `passed (${approveTargetId})`
        approvedFromSmoke = approveTargetId
    } else if (pending.length === 1) {
        const approveTargetId = pending[0].request_id
        const approved = await callAction(accessToken, approveTargetId, 'approve')
        if (
            approved?.status !== 'approved' ||
            !hasLog(approved, 'approved', 'Approved by HR')
        ) {
            throw new Error(`Approve verification failed for ${approveTargetId}`)
        }
        result.approve = `passed (${approveTargetId})`
        approvedFromSmoke = approveTargetId
        result.deny = 'skipped (only one pending request available)'
    } else {
        result.approve = 'skipped (no pending requests available)'
        result.deny = 'skipped (no pending requests available)'
    }

    requests = await fetchRequests(accessToken)
    const approvedList = requests.filter(item => item.status === 'approved')
    const cancelTargetId =
        approvedFromSmoke ?? (approvedList.length > 0 ? approvedList[0].request_id : null)

    if (cancelTargetId) {
        const cancelReason = `[${runId}] HR cancellation smoke reason`
        const cancelled = await callAction(
            accessToken,
            cancelTargetId,
            'cancel',
            cancelReason
        )

        if (
            cancelled?.status !== 'cancelled' ||
            !hasLog(cancelled, 'cancelled', cancelReason)
        ) {
            throw new Error(`Cancel verification failed for ${cancelTargetId}`)
        }

        result.cancel = `passed (${cancelTargetId})`
    } else {
        result.cancel = 'skipped (no approved requests available)'
    }

    console.log('Adjustment action smoke summary:')
    console.log(JSON.stringify(result, null, 2))

    if (strict) {
        const allPassed =
            String(result.approve).startsWith('passed') &&
            String(result.deny).startsWith('passed') &&
            String(result.cancel).startsWith('passed')

        if (!allPassed) {
            throw new Error('Strict mode failed because one or more actions were skipped')
        }
    }
}

run().catch(error => {
    console.error('Adjustment action smoke test failed.')
    console.error(error.message)
    process.exitCode = 1
})
