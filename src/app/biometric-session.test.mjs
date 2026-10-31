import test from 'node:test'
import assert from 'node:assert/strict'
import { canOfferBiometricLogin, createBiometricSession } from './biometric-session.mjs'

const initial = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', user: { id: 'fixture-user', email: 'fixture@example.com' } }

function fixture(overrides = {}) {
    const calls = []
    const saved = new Map()
    const session = createBiometricSession({
        authBaseUrl: 'https://example.supabase.co/auth/v1', publishableKey: 'sb_publishable_fixture', isNative: () => true,
        storage: {
            keys: async () => [...saved.keys()],
            set: async (key, value) => { calls.push('save'); saved.set(key, value) },
            get: async key => { calls.push('read'); return saved.get(key) },
            remove: async key => { calls.push('remove'); saved.delete(key) },
        },
        verifyIdentity: async () => { calls.push('verify'); return true },
        fetchImplementation: async (url, init) => {
            calls.push('refresh')
            assert.equal(url, 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token')
            assert.equal(init.headers.apikey, 'sb_publishable_fixture')
            assert.equal(init.headers.Authorization, undefined)
            assert.equal(JSON.parse(init.body).refresh_token, 'fixture-refresh')
            return Response.json({ ...initial, access_token: 'rotated-access', refresh_token: 'rotated-refresh' })
        },
        ...overrides,
    })
    return { session, calls, saved }
}

test('biometrics unlock stored refresh token and use Supabase Auth directly', async () => {
    const { session, calls, saved } = fixture()
    await session.remember(initial, true)
    calls.length = 0
    const payload = await session.signIn()
    assert.deepEqual(calls, ['verify', 'read', 'refresh', 'save'])
    assert.equal(payload.accessToken, 'rotated-access')
    assert.equal([...saved.values()][0].refreshToken, 'rotated-refresh')
    assert.equal([...saved.values()][0].accessToken, undefined)
})

test('cancelled verification never reads tokens or sends a request', async () => {
    const { session, calls } = fixture({ verifyIdentity: async () => false })
    assert.equal(await session.signIn(), null)
    assert.deepEqual(calls, [])
})

test('browser use cannot store credentials or bypass biometric verification', async () => {
    const { session, calls } = fixture({ isNative: () => false })
    assert.equal(await session.remember(initial, true), false)
    assert.equal(await session.available(), false)
    await assert.rejects(session.signIn(), /installed app/)
    assert.deepEqual(calls, [])
})

test('invalid refresh tokens are cleared but network failures preserve enrollment', async () => {
    for (const status of [400, 401, 500]) {
        const { session, saved } = fixture({ fetchImplementation: async () => Response.json({}, { status }) })
        await session.remember(initial, true)
        await assert.rejects(session.signIn(), /could not be renewed/)
        assert.equal(saved.size, status === 500 ? 1 : 0)
    }
})

test('disabling biometric sign-in removes the saved session', async () => {
    const { session, saved } = fixture()
    await session.remember(initial, true)
    await session.remember(initial, false)
    assert.equal(saved.size, 0)
})

test('concurrent attempts share one verification and token rotation', async () => {
    const { session, calls } = fixture()
    await session.remember(initial, true)
    const [first, second] = await Promise.all([session.signIn(), session.signIn()])
    assert.equal(first.accessToken, second.accessToken)
    assert.equal(calls.filter(call => call === 'refresh').length, 1)
})

test('biometric sign-in stays hidden before first login and when the toggle is disabled', async () => {
    const { session } = fixture()
    const availability = overrides => canOfferBiometricLogin({
        isNative: true, enabled: true, rememberedEmail: 'fixture@example.com',
        checkBiometry: async () => ({ isAvailable: true }),
        hasSavedSession: () => session.available(),
        ...overrides,
    })
    assert.equal(await availability({}), false)
    await session.remember(initial, true)
    assert.equal(await availability({ rememberedEmail: null }), false)
    assert.equal(await availability({ enabled: false }), false)
    assert.equal(await availability({}), true)
    await session.remember(initial, false)
    assert.equal(await availability({}), false)
})

test('saved biometric enrollment remains available in the next app session', async () => {
    const { session, saved } = fixture()
    await session.remember(initial, true)
    const nextSession = fixture({ storage: { keys: async () => [...saved.keys()] } }).session
    assert.equal(await canOfferBiometricLogin({
        isNative: true, enabled: true, rememberedEmail: 'fixture@example.com',
        checkBiometry: async () => ({ deviceIsSecure: true }),
        hasSavedSession: () => nextSession.available(),
    }), true)
})

test('biometric sign-in is hidden in browsers and when device verification is unavailable', async () => {
    const options = {
        isNative: true, enabled: true, rememberedEmail: 'fixture@example.com',
        checkBiometry: async () => ({ isAvailable: false, deviceIsSecure: false }),
        hasSavedSession: async () => true,
    }
    assert.equal(await canOfferBiometricLogin(options), false)
    assert.equal(await canOfferBiometricLogin({ ...options, isNative: false }), false)
    assert.equal(await canOfferBiometricLogin({
        ...options, checkBiometry: async () => { throw new Error('Unavailable') },
    }), false)
})
