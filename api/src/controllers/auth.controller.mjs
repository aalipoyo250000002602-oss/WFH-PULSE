import { registerAuthSessionRoutes } from './auth-session.controller.mjs'
import { registerAuthAdminRoutes } from './auth-admin.controller.mjs'

export function registerAuthRoutes(app, deps) {
    registerAuthSessionRoutes(app, deps)
    registerAuthAdminRoutes(app, deps)
}
