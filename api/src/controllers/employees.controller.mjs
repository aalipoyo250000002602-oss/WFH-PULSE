import { registerEmployeeCoreRoutes } from './employees-core.controller.mjs'
import { registerEmployeePayrollRoutes } from './employees-payroll.controller.mjs'

export function registerEmployeeRoutes(app, deps) {
    registerEmployeeCoreRoutes(app, deps)
    registerEmployeePayrollRoutes(app, deps)
}
