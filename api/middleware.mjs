import { verifyAccessToken } from './auth.mjs'

export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization ?? ''
    const [scheme, token] = authHeader.split(' ')

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Missing Bearer token' })
    }

    try {
        const payload = verifyAccessToken(token)
        req.auth = {
            userId: payload.userId,
            role: payload.role,
            sessionId: payload.sessionId,
            employeeId: payload.employeeId,
        }
        return next()
    } catch {
        return res.status(401).json({ error: 'Invalid token' })
    }
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.auth) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        if (!roles.includes(req.auth.role)) {
            return res.status(403).json({ error: 'Forbidden' })
        }

        return next()
    }
}
