import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiFetch, resolveSupabaseAuthBaseUrl } from './api-fetch.mjs'

const baseUrl = 'https://example.supabase.co/rest/v1'

test('Supabase Auth uses its own endpoint for REST, Auth, and Edge API URLs', () => {
    for (const path of ['/rest/v1/', '/auth/v1/', '/functions/v1/wfh-pulse-api']) {
        assert.equal(resolveSupabaseAuthBaseUrl(`https://example.supabase.co${path}`),
            'https://example.supabase.co/auth/v1')
    }
    assert.equal(resolveSupabaseAuthBaseUrl(baseUrl, 'https://example.supabase.co'),
        'https://example.supabase.co/auth/v1')
    assert.equal(resolveSupabaseAuthBaseUrl('http://localhost:8787', 'https://example.supabase.co'), '')
    assert.equal(resolveSupabaseAuthBaseUrl('not-a-url'), '')
})

test('REST API requests carry a publishable key and preserve the user token', async () => {
    const apiFetch = createApiFetch({
        apiBaseUrls: [`${baseUrl}/`],
        publishableKey: 'sb_publishable_test',
        fetchImplementation: async (input, init) => ({ input, init }),
    })
    const result = await apiFetch(`${baseUrl}/attendance_records?select=attendance_id&limit=0`, {
        headers: { Authorization: 'Bearer user-token' },
    })
    assert.equal(result.init.headers.get('apikey'), 'sb_publishable_test')
    assert.equal(result.init.headers.get('authorization'), 'Bearer user-token')
})

test('keys are not sent to local APIs, other hosts, assets, or Edge Functions', async () => {
    const apiFetch = createApiFetch({
        apiBaseUrls: [baseUrl, 'http://localhost:8787'],
        publishableKey: 'sb_publishable_test',
        fetchImplementation: async (input, init) => ({ input, init }),
    })
    for (const url of [
        'http://localhost:8787/me/profile',
        'https://other.supabase.co/rest/v1/employees',
        `${baseUrl}-other/employees`,
        '/assets/logo.png',
        'https://example.supabase.co/functions/v1/wfh-pulse-api/me/profile',
    ]) {
        const init = { headers: { Authorization: 'Bearer user-token' } }
        const result = await apiFetch(url, init)
        assert.equal(result.init, init)
        assert.equal(new Headers(result.init.headers).has('apikey'), false)
    }
})

test('Request headers and explicit header overrides are preserved', async () => {
    const apiFetch = createApiFetch({
        apiBaseUrls: [baseUrl],
        publishableKey: 'sb_publishable_test',
        fetchImplementation: async (input, init) => ({ input, init }),
    })
    const request = new Request(`${baseUrl}/attendance_records?select=attendance_id&limit=0`, {
        headers: { Authorization: 'Bearer old-token', Accept: 'application/json' },
    })
    const result = await apiFetch(request, {
        headers: { Authorization: 'Bearer new-token' },
    })
    assert.equal(result.init.headers.get('authorization'), 'Bearer new-token')
    assert.equal(result.init.headers.get('accept'), 'application/json')
    assert.equal(result.init.headers.get('apikey'), 'sb_publishable_test')
})

test('legacy routes use a valid REST RPC and preserve response shapes', async () => {
    let sentRequest
    const apiFetch = createApiFetch({
        apiBaseUrls: [baseUrl],
        publishableKey: 'sb_publishable_test',
        fetchImplementation: async (input, init) => {
            sentRequest = { input, init }
            return Response.json({ status: 200, body: { attendance: null, logs: [] } })
        },
    })
    const response = await apiFetch(`${baseUrl}/me/attendance/today?month=2026-10`, {
        headers: { Authorization: 'Bearer user-token' },
    })
    assert.equal(sentRequest.input, `${baseUrl}/rpc/wfh_pulse_request`)
    assert.equal(sentRequest.init.method, 'POST')
    assert.equal(sentRequest.init.headers.get('authorization'), 'Bearer user-token')
    assert.equal(sentRequest.init.headers.get('content-profile'), 'api')
    assert.equal(sentRequest.init.headers.get('accept-profile'), 'api')
    assert.deepEqual(JSON.parse(sentRequest.init.body), {
        p_path: '/me/attendance/today', p_method: 'GET', p_query: { month: '2026-10' }, p_body: {},
    })
    assert.deepEqual(await response.json(), { attendance: null, logs: [] })
})

test('write requests preserve their method and JSON payload in the RPC', async () => {
    let rpcBody
    const apiFetch = createApiFetch({
        apiBaseUrls: [baseUrl], publishableKey: 'sb_publishable_test',
        fetchImplementation: async (_input, init) => {
            rpcBody = JSON.parse(init.body)
            return Response.json({ status: 403, body: { error: 'Forbidden' } })
        },
    })
    const response = await apiFetch(`${baseUrl}/employees/emp-1`, {
        method: 'PATCH', body: JSON.stringify({ departmentId: 2 }),
    })
    assert.equal(rpcBody.p_method, 'PATCH')
    assert.deepEqual(rpcBody.p_body, { departmentId: 2 })
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'Forbidden' })
})

test('RPC database errors are reported without masking their status', async () => {
    const apiFetch = createApiFetch({
        apiBaseUrls: [baseUrl], publishableKey: 'sb_publishable_test',
        fetchImplementation: async () => Response.json({ code: '42501', message: 'permission denied' }, { status: 403 }),
    })
    const response = await apiFetch(`${baseUrl}/me/profile`)
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error, 'permission denied')
})