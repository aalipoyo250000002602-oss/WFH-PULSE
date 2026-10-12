import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { calculatePayrollReport } from '../api/src/services/payroll-report.service.mjs'

const root = process.cwd()
const env = parseEnv(fs.readFileSync(path.join(root, 'database', '.env.local.postgres'), 'utf8'))
if (!['127.0.0.1', 'localhost', '::1'].includes(env.PGHOST ?? '127.0.0.1')) {
    throw new Error('Run REST API fixture tests only against local PostgreSQL.')
}
const client = new Client({
    host: env.PGHOST ?? '127.0.0.1', port: Number(env.PGPORT ?? 5432),
    database: env.PGDATABASE ?? 'wfh_pulse', user: env.PGUSER ?? 'postgres', password: env.PGPASSWORD,
})

try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE SCHEMA IF NOT EXISTS wfh_private;
        CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
            SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
        $$;
    `)
    const account = (await client.query(`
        SELECT u.user_id,u.email,u.employee_id,u.supabase_auth_user_id FROM app_auth.users u
        WHERE u.is_active AND u.employee_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.role_id=ur.role_id
            WHERE ur.user_id=u.user_id AND r.role_name='admin'
        ) LIMIT 1
    `)).rows[0]
    assert.ok(account, 'An active local admin linked to an employee is required.')
    const authId = account.supabase_auth_user_id ?? '00000000-0000-4000-8000-000000000001'
    await client.query('INSERT INTO auth.users VALUES($1,$2,now()) ON CONFLICT(id) DO NOTHING', [authId, account.email])
    await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: authId, role: 'authenticated' })])
    const migration = fs.readFileSync(path.join(root, 'database', '07_supabase_rest_api.sql'), 'utf8')
    for (const name of ['attendance_json', 'active_session_minutes', 'leave_days', 'effective_attendance', 'payroll_report', 'request']) {
        const start = migration.indexOf(`CREATE OR REPLACE FUNCTION wfh_private.${name}(`)
        const end = migration.indexOf(`REVOKE ALL ON FUNCTION wfh_private.${name}(`, start)
        assert.ok(start >= 0 && end > start, `Missing function ${name}`)
        await client.query(migration.slice(start, end))
    }
    const call = async (route, method = 'POST', body = {}, query = {}) =>
        (await client.query('SELECT wfh_private.request($1,$2,$3,$4) AS response', [route, method, query, body])).rows[0].response

    await client.query("DELETE FROM app.attendance_records WHERE employee_id=$1 AND attendance_date=(now() AT TIME ZONE 'Asia/Manila')::date AND record_type='actual'", [account.employee_id])
    assert.equal((await call('/me/attendance/clock-in')).status, 201)
    assert.equal((await call('/me/attendance/clock-in')).status, 400)
    assert.equal((await call('/me/attendance/break/start')).status, 201)
    assert.equal((await call('/me/attendance/break/start')).status, 400)
    assert.equal((await call('/me/attendance/clock-out')).status, 400)
    assert.equal((await call('/me/attendance/break/end')).status, 200)
    assert.equal((await call('/me/attendance/clock-out')).status, 200)
    assert.equal((await call('/me/attendance/clock-out')).status, 400)
    const today = await call('/me/attendance/today', 'GET')
    assert.equal(today.body.logs.length, 4)
    assert.equal(today.body.attendance.isBreakActive, false)
    assert.ok(today.body.attendance.clockOut)

    assert.equal((await call('/me/profile', 'PATCH', { phone: '555-0100' })).status, 200)
    assert.equal((await call('/me/security-preferences', 'PUT', { darkModeEnabled: true })).status, 200)
    assert.equal((await call('/me/security-preferences', 'PUT', { darkModeEnabled: 'invalid' })).status, 400)
    assert.equal((await call('/settings/company-working-hours', 'PUT', { days: [
        { day: 'monday', isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
    ] })).status, 200)
    assert.equal((await call('/settings/company-working-hours', 'PUT', { days: [
        { day: 'invalid', isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
    ] })).status, 400)

    const leaveType = (await client.query(`
        SELECT lt.leave_type_id,COALESCE(lb.credits,lt.default_limit_days) AS credits FROM app.leave_types lt
        LEFT JOIN app.leave_balances lb ON lb.leave_type_id=lt.leave_type_id AND lb.employee_id=$1
        WHERE COALESCE(lb.credits,lt.default_limit_days)>0 LIMIT 1
    `, [account.employee_id])).rows[0]
    assert.ok(leaveType, 'A leave type with available credits is required.')
    const day = (await client.query(`
        SELECT day::date::text AS day FROM generate_series((current_date+14)::timestamp,(current_date+30)::timestamp,interval '1 day') day
        JOIN app.company_settings_working_hours schedule ON schedule.iso_day=extract(isodow FROM day) AND schedule.is_working_day
        WHERE wfh_private.leave_days(day::date,day::date)=1 LIMIT 1
    `)).rows[0].day
    const submitted = await call('/me/leave-requests', 'POST', {
        leaveTypeId: leaveType.leave_type_id, startDate: day, endDate: day, message: 'Rollback test leave', sourcePage: 'home',
    })
    assert.equal(submitted.status, 201)
    const leaveId = submitted.body.request.request_id
    assert.equal((await call(`/hr/leave-requests/${leaveId}/approve`)).status, 200)
    assert.equal((await call(`/me/leave-requests/${leaveId}/cancel`)).status, 200)
    const adjustment = await call('/me/attendance-adjustments', 'POST', {
        date: day, shiftDateFrom: day, shiftDateTo: day, clockInTime: '09:00', clockOutTime: '18:00',
        breakDuration: 60, reason: 'Missing logs', message: 'Rollback test adjustment',
    })
    assert.equal(adjustment.status, 201)
    assert.equal((await call(`/hr/adjustment-requests/${adjustment.body.request.requestId}/approve`)).status, 200)
    assert.equal((await call(`/me/attendance-adjustments/${adjustment.body.request.requestId}/revoke`)).status, 200)
    const overtime = await call('/me/overtime-requests', 'POST', { date: day, startTime: '19:00', endTime: '20:00', purpose: 'Rollback test overtime' })
    assert.equal(overtime.status, 201)
    assert.equal((await call(`/me/overtime-requests/${overtime.body.request.requestId}`, 'DELETE')).status, 200)

    assert.equal((await call('/me/analytics', 'GET')).status, 200)
    const created = await call('/employees', 'POST', { firstName: 'Rollback', lastName: 'Employee', employmentType: 'full-time' })
    assert.equal(created.status, 201)
    const createdId = created.body.employee.employee_id
    assert.equal((await call(`/employees/${createdId}/payroll`, 'PUT', {
        salary: 21000, governmentIds: { pagIbig: '', philHealth: '', sss: '', tin: '' },
        deductions: [{ name: 'Fixture deduction', amount: 500 }], otherEarnings: [{ name: 'Fixture earning', amount: 100 }],
    })).status, 200)
    const report = await call(`/employees/${createdId}/payroll-report`, 'GET')
    assert.equal(report.status, 200)
    assert.deepEqual(report.body.payroll, calculatePayrollReport({
        salary: report.body.payroll.salary, deductions: report.body.payroll.payrollDeductions,
        otherEarnings: report.body.payroll.otherEarnings, records: report.body.records,
    }).payroll)
    assert.equal((await call(`/employees/${createdId}/leave-credits`, 'PUT', {
        leaveCredits: [{ leaveTypeId: leaveType.leave_type_id, credits: 6 }],
    })).status, 200)
    const credits = await call(`/employees/${createdId}/leave-credits`, 'GET')
    assert.equal(credits.body.leaveCredits.find(row => row.leaveTypeId === leaveType.leave_type_id).credits, 6)
    const national = await call('/settings/holidays', 'POST', { name: 'Rollback national holiday', date: '2099-02-02', countryCode: 'PH', type: 'public' })
    assert.equal(national.status, 200)
    assert.equal((await call(`/settings/holidays/${national.body.holidays.find(row => row.name === 'Rollback national holiday').id}`, 'DELETE')).status, 200)
    assert.equal((await call('/settings/holidays', 'POST', {
        name: 'Rollback regional holiday', date: '2099-02-03', countryCode: 'PH', scope: 'subdivision',
        subdivisionCode: 'PH-TEST', subdivisionName: 'Test', type: 'public',
    })).status, 200)
    assert.equal((await call('/me/slack-notification-logs', 'GET')).status, 200)
    assert.equal((await call('/me/security-preferences/password', 'POST', { passwordUpdated: true, platform: 'fixture' })).status, 200)
    assert.equal((await call('/me/security-preferences/password', 'POST', { newPassword: 'Fixture123!' })).status, 400)

    await client.query('DELETE FROM app_auth.user_roles WHERE user_id=$1', [account.user_id])
    await client.query("INSERT INTO app_auth.user_roles(user_id,role_id) SELECT $1,role_id FROM app_auth.roles WHERE role_name='employee'", [account.user_id])
    await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: authId, role: 'authenticated', user_metadata: { role: 'admin' } })])
    assert.equal((await call('/employees', 'POST', { firstName: 'Forbidden', lastName: 'Fixture' })).status, 403)
    assert.equal((await call(`/employees/${createdId}/payroll`, 'PUT', { salary: 0 })).status, 403)
    assert.equal((await call(`/hr/leave-requests/${leaveId}/approve`)).status, 403)
    assert.equal((await call('/me/profile', 'PATCH', { firstName: 'Forbidden' })).status, 400)
    assert.equal((await call('/me/profile', 'PATCH', { phone: '555-0101' })).status, 200)
    assert.equal((await call('/me/leave-requests', 'GET')).body.requests.every(row => row.employee_id === account.employee_id), true)
    console.log('PASS: REST attendance, settings, requests, admin CRUD, analytics, payroll, and employee authorization; all fixture changes rolled back.')
} finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
}