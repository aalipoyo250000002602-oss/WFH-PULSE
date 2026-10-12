export function resolveSupabaseAuthBaseUrl(apiBaseUrl, supabaseUrl = '') {
    try {
        const apiUrl = new URL(apiBaseUrl)
        if (apiUrl.protocol !== 'https:' || !apiUrl.hostname.endsWith('.supabase.co')) return ''
        const projectUrl = new URL(supabaseUrl || apiUrl.origin)
        if (projectUrl.protocol !== 'https:' || !projectUrl.hostname.endsWith('.supabase.co')) return ''
        return `${projectUrl.origin}/auth/v1`
    } catch {
        return ''
    }
}

export function createApiFetch({
    apiBaseUrls = [],
    publishableKey = '',
    fetchImplementation = globalThis.fetch,
} = {}) {
    const restApiUrls = apiBaseUrls.flatMap(value => {
        try {
            const url = new URL(value)
            if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
                !/^\/rest\/v1\/?$/.test(url.pathname)) return []
            url.pathname = url.pathname.replace(/\/+$/, '')
            return [url]
        } catch {
            return []
        }
    })

    return async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input)
        let isRestApiRequest = false
        let restApiBase
        let parsedUrl
        try {
            const url = new URL(requestUrl)
            parsedUrl = url
            restApiBase = restApiUrls.find(base =>
                url.origin === base.origin &&
                (url.pathname === base.pathname || url.pathname.startsWith(`${base.pathname}/`))
            )
            isRestApiRequest = Boolean(restApiBase)
        } catch {}

        if (!isRestApiRequest || !publishableKey) return fetchImplementation(input, init)

        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
        headers.set('apikey', publishableKey)
        const routePath = parsedUrl.pathname.slice(restApiBase.pathname.length)
        if (/^\/(me|hr|employees|settings|meta|auth)(\/|$)/.test(routePath)) {
            const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
            const rawBody = init?.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(method.toUpperCase())
                ? await input.clone().text() : '')
            let body = {}
            try {
                body = rawBody ? JSON.parse(String(rawBody)) : {}
            } catch {
                return Response.json({ error: 'The Data API requires a JSON request body.' }, { status: 400 })
            }
            if (body === null || typeof body !== 'object' || Array.isArray(body)) {
                return Response.json({ error: 'Expected a JSON object.' }, { status: 400 })
            }
            headers.set('Content-Type', 'application/json')
            if (routePath === '/me/security-preferences/password' && method.toUpperCase() === 'POST') {
                const password = body.newPassword
                if (typeof password !== 'string' || password.length < 8 || password.length > 30 ||
                    !/[a-zA-Z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                    return Response.json({ error: 'Password must be 8-30 characters and contain a letter, number, and symbol.' }, { status: 400 })
                }
                const authHeaders = new Headers(headers)
                authHeaders.delete('Content-Profile')
                authHeaders.delete('Accept-Profile')
                const authResponse = await fetchImplementation(`${restApiBase.origin}/auth/v1/user`, {
                    method: 'PUT', headers: authHeaders, body: JSON.stringify({ password }), signal: init?.signal,
                })
                if (!authResponse.ok) {
                    const authError = await authResponse.json().catch(() => ({}))
                    return Response.json({ error: authError.msg ?? authError.message ?? 'Unable to update the Supabase Auth password.' }, {
                        status: authResponse.status,
                    })
                }
                body = { passwordUpdated: true, waivePassword: Boolean(body.waivePassword), platform: body.platform ?? 'web', status: 'Successful' }
            }
            headers.set('Content-Profile', 'api')
            headers.set('Accept-Profile', 'api')
            const response = await fetchImplementation(`${restApiBase.origin}${restApiBase.pathname}/rpc/wfh_pulse_request`, {
                ...init,
                method: 'POST',
                headers,
                body: JSON.stringify({
                    p_path: routePath,
                    p_method: method.toUpperCase(),
                    p_query: Object.fromEntries(parsedUrl.searchParams),
                    p_body: body,
                }),
            })
            const payload = await response.clone().json().catch(() => null)
            if (!response.ok) {
                return payload ? Response.json({ ...payload, error: payload.error ?? payload.message }, {
                    status: response.status,
                }) : response
            }
            if (!Number.isInteger(payload?.status) || payload.status < 200 || payload.status > 599) {
                return Response.json({ error: 'Unexpected Data API response.' }, { status: 502 })
            }
            if (payload.status === 204) return new Response(null, { status: 204 })
            return Response.json(payload.body ?? {}, { status: payload.status })
        }
        return fetchImplementation(input, { ...init, headers })
    }
}

const env = import.meta.env ?? {}

export const apiFetch = createApiFetch({
    apiBaseUrls: [env.VITE_API_BASE_URL, env.VITE_API_BASE_URL_ANDROID],
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '',
})