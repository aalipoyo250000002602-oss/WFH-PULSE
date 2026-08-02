import { registerMeProfileRoutes } from './me-profile.controller.mjs'
import { registerMeAttendanceRoutes } from './me-attendance.controller.mjs'

export function registerMeRoutes(app, deps) {
    registerMeProfileRoutes(app, deps)
    registerMeAttendanceRoutes(app, deps)
}

