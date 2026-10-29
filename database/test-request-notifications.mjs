// Spins up a disposable PostgreSQL cluster. Never connects to production or an existing database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Client, Pool } from 'pg'
import { runPushBatch } from '../api/src/services/request-push-worker.mjs'

const bin = process.env.PG_BIN || '/Library/PostgreSQL/18/bin'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-push-test-'))
const data = path.join(temp, 'data')
let started = false
let client
let pool
function run(program, args) {
    const result = spawnSync(path.join(bin, program), args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message || result.stderr}`)
}
try {
    run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
    fs.appendFileSync(path.join(data, 'postgresql.conf'), `\nlisten_addresses = ''\nunix_socket_directories = '${temp}'\n`)
    run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-w', 'start'])
    started = true
    const connection = { host: temp, user: 'postgres', database: 'postgres' }
    client = new Client(connection); await client.connect()
    pool = new Pool(connection)
    await client.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA api;
        CREATE SCHEMA wfh_private; GRANT USAGE ON SCHEMA api,wfh_private,auth TO authenticated;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
          SELECT nullif(current_setting('test.auth_id',true),'')::uuid $$;
        CREATE FUNCTION wfh_private.request(text,text,jsonb,jsonb) RETURNS jsonb LANGUAGE sql AS $$
          SELECT '{"status":200,"body":{"legacy":true}}'::jsonb $$;`)
    await client.query(fs.readFileSync('database/01_schema_postgresql18.sql', 'utf8'))
    await client.query(`ALTER TABLE app_auth.users ADD COLUMN supabase_auth_user_id uuid;
        CREATE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;`)
    await client.query(fs.readFileSync('database/10_request_notifications.sql', 'utf8'))
    // Reapplying the deployment file must not duplicate triggers or destroy data.
    await client.query(fs.readFileSync('database/10_request_notifications.sql', 'utf8'))
    const users = Object.fromEntries(['admin1', 'admin2', 'employee1', 'employee2', 'hr', 'inactive'].map(name => [name, randomUUID()]))
    for (const role of ['admin', 'hr_manager', 'employee']) await client.query('INSERT INTO app_auth.roles(role_name) VALUES($1)', [role])
    for (const [name, id] of Object.entries(users)) {
        const employee = name.startsWith('employee') ? name : null
        if (employee) await client.query(`INSERT INTO app.employees(employee_id,employee_code,first_name,last_name)
            VALUES($1,$1,$1,'Test')`, [employee])
        await client.query(`INSERT INTO auth.users VALUES($1,$2,now());`, [id, `${name}@fixture.invalid`])
        await client.query(`INSERT INTO app_auth.users(user_id,employee_id,email,password_hash,is_active,supabase_auth_user_id)
            VALUES($1,$2,$3,'fixture-only',$4,$1)`, [id, employee, `${name}@fixture.invalid`, name !== 'inactive'])
        const role = name.startsWith('admin') || name === 'inactive' ? 'admin' : name === 'hr' ? 'hr_manager' : 'employee'
        await client.query(`INSERT INTO app_auth.user_roles SELECT $1,role_id FROM app_auth.roles WHERE role_name=$2`, [id, role])
    }
    await client.query(`INSERT INTO app.leave_types(leave_type_id,name) VALUES('annual','Annual')`)
    const installs = {}
    async function register(name, suffix = '') {
        const installationId = randomUUID(); installs[name + suffix] = installationId
        const result = await client.query(`SELECT wfh_private.push_device_request($1,'PUT',$2::jsonb) AS result`, [users[name], JSON.stringify({
            installationId, platform: 'android', token: `${name}${suffix}-fixture-token-1234567890`, userId: users.employee2,
        })])
        assert.equal(result.rows[0].result.status, 200)
        return installationId
    }
    await register('admin1'); await register('admin1', '-second'); await register('admin2')
    await register('employee1'); await register('employee2'); await register('hr')
    const actor = name => client.query("SELECT set_config('app.user_id',$1,false)", [users[name]])
    async function leave(id) {
        await client.query(`INSERT INTO app.leave_requests(request_id,employee_id,leave_type_id,start_date,end_date,status,submitted_at,source_page)
            VALUES($1,'employee1','annual',CURRENT_DATE,CURRENT_DATE,'pending',now(),'home')`, [id])
    }
    await actor('employee1'); await leave('leave-1')
    for (const [id, source] of [['adjust-1', 'home'], ['overtime-1', 'home-overtime']]) {
        await client.query(`INSERT INTO app.attendance_adjustment_requests(request_id,employee_id,shift_date_from,shift_date_to,reason,status,source_page)
            VALUES($1,'employee1',CURRENT_DATE,CURRENT_DATE,'Missing logs','pending',$2)`, [id, source])
    }
    for (const requestId of ['leave-1', 'adjust-1', 'overtime-1']) {
        const rows = (await client.query('SELECT recipient_user_id FROM app.request_notifications WHERE request_id=$1', [requestId])).rows
        assert.deepEqual(rows.map(row => row.recipient_user_id).sort(), [users.admin1, users.admin2].sort())
    }
    assert.equal((await client.query('SELECT count(*)::int AS count FROM app.push_deliveries')).rows[0].count, 9)
    await actor('admin1')
    await client.query(`UPDATE app.leave_requests SET status='approved',requestor_user_id=$1 WHERE request_id='leave-1'`, [users.employee2])
    assert.equal((await client.query(`SELECT requestor_user_id FROM app.leave_requests WHERE request_id='leave-1'`)).rows[0].requestor_user_id, users.employee1)
    await actor('hr')
    await client.query(`UPDATE app.attendance_adjustment_requests SET status='denied' WHERE request_id='adjust-1'`)
    const statuses = (await client.query(`SELECT recipient_user_id FROM app.request_notifications WHERE event_kind='status_changed'`)).rows
    assert.equal(statuses.length, 2)
    assert.ok(statuses.every(row => row.recipient_user_id === users.employee1))
    await actor('employee1'); await leave('all-statuses')
    await actor('admin2')
    for (const status of ['approved', 'denied', 'cancelled', 'pending']) {
        await client.query("UPDATE app.leave_requests SET status=$1::app.request_status WHERE request_id='all-statuses'", [status])
    }
    const allStatuses = (await client.query("SELECT recipient_user_id,request_status FROM app.request_notifications WHERE request_id='all-statuses' AND event_kind='status_changed' ORDER BY created_at,notification_id")).rows
    assert.equal(allStatuses.length, 4)
    assert.ok(allStatuses.every(row => row.recipient_user_id === users.employee1))
    assert.deepEqual(allStatuses.map(row => row.request_status).sort(), ['approved','denied','cancelled','pending'].sort())
    const count = async () => (await client.query('SELECT count(*)::int AS count FROM app.request_notifications')).rows[0].count
    const before = await count()
    await actor('admin1'); await client.query(`UPDATE app.leave_requests SET status='approved' WHERE request_id='leave-1'`)
    assert.equal(await count(), before, 'Unchanged status must not duplicate notifications')
    await actor('employee1'); await client.query('BEGIN'); await leave('rolled-back'); await client.query('ROLLBACK')
    assert.equal(await count(), before, 'Rolled-back requests must not create notifications')
    // Same physical installation changes account: old admin jobs must never reach employee2.
    await client.query(`SELECT wfh_private.push_device_request($1,'PUT',$2::jsonb)`, [users.employee2, JSON.stringify({
        installationId: installs.admin1, platform: 'android', token: 'admin1-fixture-token-1234567890',
    })])
    const sent = []
    const send = async job => sent.push(job)
    send.configuredPlatforms = ['android','ios']
    while (await runPushBatch(pool, send)) {}
    assert.ok(sent.length > 0)
    assert.ok(sent.every(job => ![users.employee2,users.hr,users.inactive].includes(job.recipient_user_id)))
    assert.ok(sent.every(job => job.token !== 'admin1-fixture-token-1234567890'))
    assert.ok(sent.filter(job => job.event_kind === 'status_changed').every(job => job.recipient_user_id === users.employee1))
    const sentCount = sent.length
    await runPushBatch(pool, send)
    assert.equal(sent.length, sentCount, 'Completed deliveries must not be resent')
    // A transient provider failure stays queued, then succeeds on the next attempt.
    await actor('employee1'); await leave('retry-request')
    let failedOnce = false
    const retrySend = async job => {
        if (!failedOnce) { failedOnce = true; throw new Error('fixture provider unavailable') }
        sent.push(job)
    }
    retrySend.configuredPlatforms = ['android']
    await runPushBatch(pool, retrySend)
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM app.push_deliveries q
        JOIN app.request_notifications n USING(notification_id) WHERE n.request_id='retry-request'
        AND q.delivered_at IS NULL AND q.last_error IS NOT NULL AND q.failed_at IS NULL`)).rows[0].count, 1)
    await client.query(`UPDATE app.push_deliveries SET next_attempt_at=now() WHERE last_error IS NOT NULL`)
    await runPushBatch(pool, send)
    // Direct table access is forbidden; the authenticated RPC ignores client-supplied user IDs.
    await client.query("SELECT set_config('test.auth_id',$1,false)", [users.employee1])
    await client.query('SET ROLE authenticated')
    await assert.rejects(client.query('SELECT token FROM app.push_devices'), error => error.code === '42501')
    const ownInstall = randomUUID()
    const rpc = (await client.query(`SELECT api.wfh_pulse_request('/me/push-devices','PUT','{}',$1::jsonb) AS result`, [JSON.stringify({
        installationId: ownInstall, platform: 'android', token: 'rpc-fixture-device-token-1234567890', userId: users.employee2,
    })])).rows[0].result
    assert.equal(rpc.status, 200)
    await client.query('RESET ROLE')
    assert.equal((await client.query('SELECT user_id FROM app.push_devices WHERE installation_id=$1', [ownInstall])).rows[0].user_id, users.employee1)
    // Invalid native tokens cannot enter the APNs queue.
    const invalid = (await client.query(`SELECT wfh_private.push_device_request($1,'PUT',$2::jsonb) AS result`,
        [users.employee1, JSON.stringify({ installationId: randomUUID(), platform: 'ios', token: 'invalid-token-with-characters' })])).rows[0].result
    assert.equal(invalid.status, 400)
    // Logging out removes only the caller's registration.
    await client.query(`SELECT wfh_private.push_device_request($1,'DELETE',$2::jsonb)`, [users.employee2, JSON.stringify({ installationId: ownInstall })])
    assert.equal((await client.query('SELECT count(*)::int AS count FROM app.push_devices WHERE installation_id=$1', [ownInstall])).rows[0].count, 1)
    await client.query(`SELECT wfh_private.push_device_request($1,'DELETE',$2::jsonb)`, [users.employee1, JSON.stringify({ installationId: ownInstall })])
    assert.equal((await client.query('SELECT count(*)::int AS count FROM app.push_devices WHERE installation_id=$1', [ownInstall])).rows[0].count, 0)
    await client.query(fs.readFileSync('database/migrations/0027_request_push_notifications.down.sql', 'utf8'))
    assert.equal((await client.query("SELECT to_regclass('app.push_devices') AS name")).rows[0].name, null)
    console.log('PASS: isolated PostgreSQL recipient routing, private registration, account switching, rollback, retry, deduplication, and migration reversal.')
} finally {
    await pool?.end()
    await client?.end()
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    fs.rmSync(temp, { recursive: true, force: true })
}
