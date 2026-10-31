export function mapSupabaseSession(session) {
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
        throw new Error('Sign-in could not be completed. Please try again.')
    }
    return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        sessionId: session.user.id,
        user: { email: session.user.email, fullName: session.user.user_metadata?.full_name ?? null },
    }
}

export function createBiometricSession({ authBaseUrl, publishableKey, isNative, storage, verifyIdentity, keychainAccess, fetchImplementation = globalThis.fetch }) {
    const storageKey = `wfh:biometric-session:${authBaseUrl}`
    let pendingSignIn

    const forget = async () => {
        if (isNative()) await storage.remove(storageKey, false)
    }
    const remember = async (session, enabled) => {
        if (!isNative()) return false
        if (!enabled) {
            await forget()
            return false
        }
        const payload = mapSupabaseSession(session)
        await storage.set(storageKey, { refreshToken: payload.refreshToken, userId: payload.sessionId }, false, false, keychainAccess)
        return true
    }
    const available = async () => {
        if (!isNative()) return false
        return (await storage.keys(false)).includes(storageKey)
    }
    const signIn = () => {
        if (pendingSignIn) return pendingSignIn
        pendingSignIn = (async () => {
            if (!isNative()) throw new Error('Device biometric sign-in is available in the installed app, not the browser.')
            if (!await verifyIdentity()) return null
            const saved = await storage.get(storageKey, false, false)
            if (!saved?.refreshToken || !saved?.userId) {
                throw new Error('Sign in with email and password once on this device to enable biometric sign-in.')
            }
            const response = await fetchImplementation(`${authBaseUrl}/token?grant_type=refresh_token`, {
                method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: saved.refreshToken }),
            })
            const session = await response.json().catch(() => ({}))
            if (!response.ok) {
                if (response.status === 400 || response.status === 401 || response.status === 403) await forget()
                throw new Error('Your saved session could not be renewed. Sign in with email and password again.')
            }
            const payload = mapSupabaseSession(session)
            if (payload.sessionId !== saved.userId) {
                await forget()
                throw new Error('The saved account does not match this session. Sign in with email and password again.')
            }
            await remember(session, true)
            return payload
        })().finally(() => { pendingSignIn = null })
        return pendingSignIn
    }

    return { remember, available, forget, signIn }
}

// Visibility depends on enrollment on this device, never other accounts on the server.
export async function canOfferBiometricLogin({ isNative, enabled, rememberedEmail, checkBiometry, hasSavedSession }) {
    if (!isNative || !enabled || !rememberedEmail) return false
    try {
        const biometry = await checkBiometry()
        if (!biometry.isAvailable && !biometry.deviceIsSecure) return false
        return Boolean(await hasSavedSession())
    } catch {
        return false
    }
}
