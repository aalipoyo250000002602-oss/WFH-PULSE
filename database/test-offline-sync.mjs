// Spins up a disposable PostgreSQL cluster. Never connects to production or an existing database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Client, Pool } from 'pg'

const bin = process.env.PG_BIN || '/Library/PostgreSQL/18/bin'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-offline-test-'))
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
    run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-w', 'start']); started = true
    client = new Client({ host: temp, user: 'postgres', database: 'postgres' }); await client.connect()
    await client.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA api;
        CREATE SCHEMA wfh_private; GRANT USAGE ON SCHEMA api,wfh_private,auth TO authenticated;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.auth_id',true),'')::uuid $$;`)
    await client.query(fs.readFileSync('database/01_schema_postgresql18.sql','utf8'))
    const rls = fs.readFileSync('database/04_rls_policies.sql','utf8')
    await client.query(rls.slice(0,rls.indexOf('ALTER TABLE app.employees')))
    for (const prefix of ['0005','0007','0010','0011','0013','0014','0015','0016','0018','0022']) {
        const file=fs.readdirSync('database/migrations').find(file => file.startsWith(prefix) && file.endsWith('.up.sql'))
        await client.query(fs.readFileSync(`database/migrations/${file}`,'utf8'))
    }
    await client.query(fs.readFileSync('database/07_supabase_rest_api.sql','utf8'))
    await client.query(fs.readFileSync('database/10_request_notifications.sql','utf8'))
    await client.query(fs.readFileSync('database/11_offline_sync.sql','utf8'))
    // Real Slack trigger, with only its outbound HTTP function mocked inside this disposable cluster.
    await client.query(`CREATE SCHEMA vault; CREATE SCHEMA net;
        CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
        INSERT INTO vault.decrypted_secrets VALUES('slack_attendance_webhook','https://slack.fixture.invalid');
        CREATE TABLE public.test_slack_posts(payload jsonb);
        CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
        RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.test_slack_posts VALUES(body); RETURN 1; END $$;`)
    const slack=fs.readFileSync('database/08_external_integrations.sql','utf8')
    await client.query(slack.slice(slack.indexOf('CREATE OR REPLACE FUNCTION wfh_private.queue_slack_attendance_notification'),
        slack.indexOf('CREATE OR REPLACE FUNCTION wfh_private.gemini_leave_insights')))
    const a=randomUUID(),b=randomUUID(),admin=randomUUID()
    for (const role of ['employee','admin']) await client.query('INSERT INTO app_auth.roles(role_name) VALUES($1)',[role])
    for (const [id,name,role] of [[a,'employee-a','employee'],[b,'employee-b','employee'],[admin,'admin','admin']]) {
        await client.query(`INSERT INTO app.employees(employee_id,employee_code,first_name,last_name,email) VALUES($1,$1,$1,'Fixture',$2)`,[name,`${name}@fixture.invalid`])
        await client.query('INSERT INTO auth.users VALUES($1,$2,now())',[id,`${name}@fixture.invalid`])
        await client.query(`INSERT INTO app_auth.users(user_id,employee_id,email,password_hash,supabase_auth_user_id) VALUES($1,$2,$3,'fixture',$1)`,[id,name,`${name}@fixture.invalid`])
        await client.query('INSERT INTO app_auth.user_roles SELECT $1,role_id FROM app_auth.roles WHERE role_name=$2',[id,role])
    }
    await client.query(`INSERT INTO app.company_settings_working_hours(iso_day,day_name,is_working_day,start_time,end_time)
        SELECT n,btrim(lower(to_char(date '2026-01-05'+(n-1),'day')))::text,true,'09:00','18:00' FROM generate_series(1,7) n
        ON CONFLICT(iso_day) DO UPDATE SET is_working_day=true,start_time='09:00',end_time='18:00'`)
    await client.query(`INSERT INTO app.leave_types(leave_type_id,name,default_limit_days) VALUES('annual','Annual',10) ON CONFLICT DO NOTHING`)
    const day=(await client.query(`SELECT to_char(d,'YYYY-MM-DD') AS day FROM generate_series(CURRENT_DATE-10,CURRENT_DATE-2,interval '1 day') d
        WHERE extract(isodow FROM d)<6 ORDER BY d DESC LIMIT 1`)).rows[0].day
    const actor = id => client.query("SELECT set_config('test.auth_id',$1,false)",[id])
    const operation=(path,time,body={})=>({operationId:randomUUID(),path,method:'POST',body,occurredAt:`${day}T${time}:00+08:00`})
    const sync=async op=>(await client.query(`SELECT api.wfh_pulse_request('/me/offline-sync','POST','{}',$1::jsonb) AS response`,[JSON.stringify(op)])).rows[0].response
    const count=async table=>(await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
    await actor(a)
    assert.equal(await count('public.test_slack_posts'),0)
    const clockIn=operation('/me/attendance/clock-in','09:00')
    const breakStart=operation('/me/attendance/break/start','12:00')
    const breakEnd=operation('/me/attendance/break/end','13:00')
    const clockOut=operation('/me/attendance/clock-out','18:00')
    for (const op of [clockIn,breakStart,breakEnd,clockOut]) {
        const result=await sync(op)
        assert.equal(result.status,200,JSON.stringify(result))
        assert.deepEqual(await sync(op),result,'A lost response must replay the receipt, not the mutation')
    }
    const attendance=(await client.query(`SELECT to_char(clock_in,'HH24:MI') AS start,to_char(clock_out,'HH24:MI') AS finish,work_duration_minutes,total_break_duration_minutes,attendance_date::text AS day FROM app.attendance_records WHERE employee_id='employee-a' AND record_type='actual'`)).rows[0]
    assert.deepEqual(attendance,{start:'09:00',finish:'18:00',work_duration_minutes:480,total_break_duration_minutes:60,day})
    assert.equal(await count('app.attendance_activity_logs'),4)
    assert.equal(await count('public.test_slack_posts'),2)
    const text=(await client.query('SELECT payload->>\'text\' AS text FROM public.test_slack_posts')).rows
    assert.ok(text[0].text.includes(`09:00 ${day}`)); assert.ok(text[1].text.includes(`18:00 ${day}`))
    assert.equal((await sync({...clockIn,occurredAt:`${day}T09:01:00+08:00`})).status,409)
    assert.equal(await count('public.test_slack_posts'),2)
    assert.equal((await sync({...operation('/me/attendance/clock-in','08:00'),occurredAt:new Date(Date.now()+600000).toISOString()})).status,409)
    assert.equal((await sync(operation('/hr/leave-requests/other/approve','10:00'))).status,400)
    await actor(b)
    assert.equal((await sync({...clockOut,body:{userId:a}})).status,409,'User B cannot replay User A attendance or read their receipt')
    await actor(a)
    const future=(await client.query(`SELECT to_char(d,'YYYY-MM-DD') AS day FROM generate_series(CURRENT_DATE+5,CURRENT_DATE+20,interval '1 day') d
      WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM app.holidays h WHERE h.holiday_date=d::date)
      AND NOT EXISTS(SELECT 1 FROM app.holiday_subdivision_holidays h WHERE h.holiday_date=d::date) LIMIT 1`)).rows[0].day
    const leave=operation('/me/leave-requests','15:00',{leaveTypeId:'annual',startDate:future,endDate:future,message:'Offline annual leave',sourcePage:'calendar'})
    const saved=await sync(leave); assert.equal(saved.status,201,JSON.stringify(saved)); assert.deepEqual(await sync(leave),saved)
    assert.equal(await count('app.leave_requests'),1)
    const notices=(await client.query('SELECT recipient_user_id FROM app.request_notifications')).rows
    assert.deepEqual(notices.map(row=>row.recipient_user_id),[admin])
    assert.equal((await client.query(`SELECT submitted_at=$1::timestamptz AS captured FROM app.leave_requests`,[leave.occurredAt])).rows[0].captured,true)
    const before=await count('app.offline_sync_receipts')
    await client.query('BEGIN'); await actor(b)
    assert.equal((await sync(operation('/me/attendance/clock-in','09:00'))).status,200)
    await client.query('ROLLBACK')
    assert.equal(await count('app.offline_sync_receipts'),before)
    assert.equal(await count('public.test_slack_posts'),2,'Rollback must not leave an outbound Slack event')
    // Preserve the existing ability to clock out and clock in again on the same day.
    const anotherDay=(await client.query("SELECT to_char($1::date-1,'YYYY-MM-DD') AS day",[day])).rows[0].day
    await actor(a)
    for (const [path,time] of [['clock-in','09:00'],['clock-out','12:00'],['clock-in','13:00'],['clock-out','18:00']]) {
        const op=operation(`/me/attendance/${path}`,time); op.occurredAt=op.occurredAt.replace(day,anotherDay)
        const result=await sync(op); assert.equal(result.status,200,JSON.stringify(result))
    }
    assert.equal((await client.query("SELECT work_duration_minutes FROM app.attendance_records WHERE employee_id='employee-a' AND attendance_date=$1::date",[anotherDay])).rows[0].work_duration_minutes,480)
    assert.equal(await count('public.test_slack_posts'),6)
    await client.query('SET ROLE authenticated')
    await assert.rejects(client.query('SELECT * FROM app.offline_sync_receipts'),error=>error.code==='42501')
    await client.query('RESET ROLE')
    await client.query(fs.readFileSync('database/migrations/0028_offline_sync.down.sql','utf8'))
    assert.equal((await client.query("SELECT to_regclass('app.offline_sync_receipts') AS name")).rows[0].name,'app.offline_sync_receipts')
    assert.equal((await client.query("SELECT to_regprocedure('wfh_private.sync_offline_operation(jsonb)') AS name")).rows[0].name,null)
    console.log('PASS: delayed attendance timestamps, break calculations, idempotent receipts, exactly-once Slack enqueue, request notifications, account isolation, rollback, and migration reversal.')
} finally {
    await pool?.end()
    await client?.end()
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    fs.rmSync(temp, { recursive: true, force: true })
}
