import express from 'express'
import cors from 'cors'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getApiConfig } from '../config/api.config.mjs'
import { query, withRlsContext, pool } from '../models/db.model.mjs'
import { signAccessToken } from '../services/token.service.mjs'
import { requireAuth, requireRole } from '../middleware/auth.middleware.mjs'
import { registerAuthRoutes } from './auth.controller.mjs'
import { registerMeRoutes } from './me.controller.mjs'
import { registerEmployeeRoutes } from './employees.controller.mjs'
import { registerSettingsRoutes } from './settings.controller.mjs'

const app = express()
const { port, envPath, supabase, database } = getApiConfig()

app.use(cors())
app.use(express.json())

app.get('/health', async (_req, res) => {
    try {
        const dbResult = await query('SELECT NOW() AS now')
        return res.json({
            ok: true,
            dbTime: dbResult.rows[0].now,
            envPath,
        })
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message })
    }
})

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
})

const refreshSchema = z.object({
    sessionId: z.string().uuid(),
    refreshToken: z.string().min(1),
})

const supabaseTokenExchangeSchema = z.object({
    accessToken: z.string().min(1),
})

const biometricLoginSchema = z.object({
    email: z.string().email().optional(),
})

const allowedRoleNames = new Set(['admin', 'hr_manager', 'employee'])

function normalizeRoleName(value) {
    if (typeof value !== 'string') {
        return 'employee'
    }

    const normalized = value.trim().toLowerCase()
    return allowedRoleNames.has(normalized) ? normalized : 'employee'
}

async function fetchSupabaseUserFromAccessToken(accessToken) {
    const supabaseUrl = (supabase.url ?? '').trim().replace(/\/+$/, '')
    const supabaseApiKey =
        (supabase.publishableKey ?? '').trim() ||
        (process.env.SUPABASE_ANON_KEY ?? '').trim()

    if (!supabaseUrl || !supabaseApiKey) {
        throw new Error('Supabase auth exchange is not configured')
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: supabaseApiKey,
            Authorization: `Bearer ${accessToken}`,
        },
    })

    if (!response.ok) {
        return null
    }

    const body = await response.json().catch(() => null)
    if (
        !body ||
        typeof body.id !== 'string' ||
        typeof body.email !== 'string'
    ) {
        return null
    }

    return body
}

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
const base64ImageDataUrlRegex =
    /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/
const calendarSampleStatusByDate = {
    '2025-10-01': 'present',
    '2025-10-02': 'present',
    '2025-10-03': 'late',
    '2025-10-06': 'present',
    '2025-10-07': 'present',
    '2025-10-08': 'present',
    '2025-10-09': 'late',
    '2025-10-10': 'present',
    '2025-10-13': 'present',
    '2025-10-14': 'present',
    '2025-10-15': 'absent',
    '2025-10-16': 'on-leave',
    '2025-10-17': 'present',
    '2025-10-20': 'present',
    '2025-10-21': 'late',
    '2025-10-22': 'present',
    '2025-10-23': 'present',
    '2025-10-24': 'present',
    '2025-10-27': 'present',
    '2025-10-28': 'present',
    '2025-10-29': 'late',
    '2025-10-30': 'present',
    '2025-10-31': 'present',
    '2025-09-01': 'present',
    '2025-09-02': 'present',
    '2025-09-03': 'absent',
    '2025-09-04': 'present',
    '2025-09-05': 'present',
    '2025-09-08': 'present',
    '2025-09-09': 'present',
    '2025-09-10': 'late',
    '2025-09-11': 'present',
    '2025-09-12': 'present',
    '2025-09-15': 'absent',
    '2025-09-16': 'present',
    '2025-09-17': 'present',
    '2025-09-18': 'present',
    '2025-09-19': 'late',
    '2025-09-22': 'present',
    '2025-09-23': 'present',
    '2025-09-24': 'absent',
    '2025-09-25': 'present',
    '2025-09-26': 'late',
    '2025-09-29': 'present',
    '2025-09-30': 'present',
    '2025-11-03': 'present',
    '2025-11-04': 'present',
    '2025-11-05': 'present',
    '2025-11-06': 'late',
    '2025-11-07': 'present',
    '2025-11-10': 'present',
    '2025-11-12': 'present',
    '2025-11-13': 'present',
    '2025-11-14': 'present',
    '2025-11-17': 'present',
    '2025-11-18': 'present',
    '2025-11-19': 'late',
    '2025-11-20': 'present',
    '2025-11-21': 'present',
    '2025-11-24': 'present',
    '2025-11-25': 'present',
    '2025-11-26': 'on-leave',
    '2025-08-18': 'present',
    '2025-08-19': 'present',
    '2025-08-20': 'late',
    '2025-08-21': 'present',
    '2025-08-22': 'present',
    '2025-08-25': 'present',
    '2025-08-26': 'present',
    '2025-08-27': 'present',
    '2025-08-28': 'absent',
    '2025-08-29': 'present',
    '2026-06-01': 'present',
    '2026-06-02': 'present',
    '2026-06-03': 'present',
    '2026-06-04': 'present',
    '2026-06-05': 'late',
    '2026-06-08': 'present',
    '2026-06-09': 'present',
    '2026-06-10': 'present',
    '2026-06-11': 'absent',
    '2026-06-12': 'holiday',
    '2026-06-15': 'on-leave',
    '2026-06-16': 'present',
    '2026-06-17': 'present',
    '2026-06-18': 'present',
    '2026-06-19': 'late',
    '2026-06-22': 'present',
    '2026-06-23': 'present',
    '2026-06-24': 'present',
    '2026-06-25': 'present',
    '2026-06-26': 'present',
    '2026-06-29': 'present',
    '2026-06-30': 'present',
    '2026-07-01': 'present',
    '2026-07-02': 'present',
    '2026-07-03': 'present',
    '2026-07-06': 'present',
    '2026-07-07': 'late',
    '2026-07-08': 'present',
    '2026-07-09': 'present',
    '2026-07-10': 'present',
    '2026-07-13': 'present',
    '2026-07-14': 'on-leave',
    '2026-07-15': 'absent',
    '2026-07-16': 'present',
    '2026-07-17': 'present',
    '2026-07-20': 'late',
    '2026-07-21': 'present',
}

const calendarSampleTimingByStatus = {
    present: {
        clockIn: '08:55',
        clockOut: '17:10',
        workDurationMinutes: 495,
        lateMinutes: 0,
    },
    late: {
        clockIn: '09:20',
        clockOut: '17:30',
        workDurationMinutes: 490,
        lateMinutes: 20,
    },
    absent: {
        clockIn: null,
        clockOut: null,
        workDurationMinutes: null,
        lateMinutes: 0,
    },
    'on-leave': {
        clockIn: null,
        clockOut: null,
        workDurationMinutes: 480,
        lateMinutes: 0,
    },
    holiday: {
        clockIn: null,
        clockOut: null,
        workDurationMinutes: null,
        lateMinutes: 0,
    },
}
const employmentTypeOptions = [
    'full-time',
    'independent contractor',
    'part-time',
    'intern',
    'contract-to-hire',
    'project-based',
    'temporary',
    'consultant',
    'freelance',
    'apprentice',
]
const isoTimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
const workingDayOptions = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
]
const isoDayByName = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
}
const attendanceTimeZone =
    process.env.ATTENDANCE_TIMEZONE ?? process.env.APP_TIMEZONE ?? 'Asia/Manila'

function normalizeTimeValue(value) {
    if (value == null) {
        return null
    }

    const str = String(value)
    if (!str) {
        return null
    }

    return str.slice(0, 5)
}

function buildScheduleValidationError({
    day,
    isWorkingDay,
    startTime,
    endTime,
}) {
    if (!workingDayOptions.includes(day)) {
        return 'Invalid day value'
    }

    if (!isWorkingDay) {
        if (startTime !== null || endTime !== null) {
            return 'Rest days must not have startTime or endTime'
        }
        return null
    }

    if (startTime == null || endTime == null) {
        return 'Working days must include startTime and endTime'
    }

    if (!isoTimeRegex.test(startTime) || !isoTimeRegex.test(endTime)) {
        return 'Invalid time format. Use HH:MM'
    }

    if (startTime >= endTime) {
        return 'startTime must be earlier than endTime'
    }

    return null
}

function mapCompanyWorkingHourRow(row) {
    return {
        working_hour_id: Number(row.working_hour_id),
        iso_day: Number(row.iso_day),
        day: row.day_name,
        is_working_day: row.is_working_day,
        start_time: normalizeTimeValue(row.start_time),
        end_time: normalizeTimeValue(row.end_time),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

const companyWorkingHourCreateSchema = z.object({
    day: z.enum(workingDayOptions),
    isWorkingDay: z.boolean(),
    startTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
    endTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
})

const companyWorkingHourUpdateSchema = z
    .object({
        day: z.enum(workingDayOptions).optional(),
        isWorkingDay: z.boolean().optional(),
        startTime: z
            .union([z.string().regex(isoTimeRegex), z.null()])
            .optional(),
        endTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
    })
    .refine(payload => Object.keys(payload).length > 0, {
        message: 'At least one field is required',
    })

const companyWorkingHourBulkSchema = z.object({
    days: z.array(companyWorkingHourCreateSchema).min(1).max(7),
})

const passwordSymbolRegex = /[!@#$%^&*(),.?":{}|<>]/

const securityPreferenceCreateSchema = z.object({
    biometricLogin: z.boolean().default(false),
    biometricClockInOut: z.boolean().default(false),
    passwordWaived: z.boolean().default(false),
    darkModeEnabled: z.boolean().optional(),
})

const securityPreferenceUpdateSchema = z
    .object({
        biometricLogin: z.boolean().optional(),
        biometricClockInOut: z.boolean().optional(),
        passwordWaived: z.boolean().optional(),
        darkModeEnabled: z.boolean().optional(),
    })
    .refine(payload => Object.keys(payload).length > 0, {
        message: 'At least one field is required',
    })

const updatePasswordSchema = z.object({
    newPassword: z.string().min(8).max(30),
    waivePassword: z.boolean().default(false),
    platform: z.string().min(1).max(120).optional(),
    status: z.string().min(1).max(40).optional(),
    details: z.record(z.any()).optional(),
})

const adjustmentReasonOptions = ['Forgot to Clock-in/Clock-out', 'Missing logs']
const adjustmentStatusOptions = ['pending', 'approved', 'denied', 'cancelled']

const attendanceAdjustmentCreateSchema = z.object({
    date: z.string().regex(isoDateRegex),
    reason: z.enum(adjustmentReasonOptions),
    shiftDateFrom: z.string().regex(isoDateRegex),
    shiftDateTo: z.string().regex(isoDateRegex),
    clockInTime: z.string().regex(isoTimeRegex),
    clockOutTime: z.string().regex(isoTimeRegex),
    breakDuration: z.number().int().min(0).max(360),
    message: z.string().min(3).max(5000),
    attachments: z.array(z.string().min(1).max(260)).max(10).optional(),
})

const attendanceAdjustmentUpdateSchema = attendanceAdjustmentCreateSchema

const overtimeRequestCreateSchema = z.object({
    date: z.string().regex(isoDateRegex),
    startTime: z.string().regex(isoTimeRegex),
    endTime: z.string().regex(isoTimeRegex),
    purpose: z.string().min(3).max(5000),
    attachments: z.array(z.string().min(1).max(260)).max(10).optional(),
})

const overtimeRequestUpdateSchema = overtimeRequestCreateSchema

const leaveRequestCreateSchema = z.object({
    leaveTypeId: z.string().min(1).max(120),
    startDate: z.string().regex(isoDateRegex),
    endDate: z.string().regex(isoDateRegex),
    message: z.string().min(3).max(5000),
    attachments: z.array(z.string().min(1).max(260)).max(10).optional(),
    sourcePage: z.string().min(1).max(40).optional(),
})

function mapSecurityPreferenceRow(row) {
    return {
        biometricLogin: row.biometric_login,
        biometricClockInOut: row.biometric_clock_in_out,
        passwordWaived: row.password_waived,
        darkModeEnabled: row.dark_mode_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function mapPasswordActivityRow(row) {
    return {
        activityId: Number(row.activity_id),
        action: row.action,
        activityAt: row.activity_at,
        platform: row.platform,
        status: row.status,
        isWaived: row.is_waived,
        details: row.details,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
    }
}

function parseTimeToMinutes(value) {
    if (!isoTimeRegex.test(value)) {
        return null
    }

    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
}

function computeTotalWorkDurationMinutes(
    clockInTime,
    clockOutTime,
    breakDurationMinutes
) {
    const clockInMinutes = parseTimeToMinutes(clockInTime)
    const clockOutMinutes = parseTimeToMinutes(clockOutTime)
    if (clockInMinutes == null || clockOutMinutes == null) {
        return null
    }

    const total =
        clockOutMinutes - clockInMinutes - Number(breakDurationMinutes)
    if (!Number.isFinite(total) || total <= 0) {
        return null
    }

    return total
}

async function getWorkingScheduleForDate(client, _employeeId, dateValue) {
    const result = await client.query(
        `
    SELECT
      c.day_name,
      c.is_working_day,
      c.start_time,
      c.end_time
    FROM app.company_settings_working_hours c
    WHERE c.iso_day = EXTRACT(ISODOW FROM $1::date)::smallint
    LIMIT 1
    `,
        [dateValue]
    )

    const row = result.rows[0] ?? null
    if (!row) {
        return null
    }

    return {
        day: row.day_name,
        isWorkingDay: Boolean(row.is_working_day),
        startTime: normalizeTimeValue(row.start_time),
        endTime: normalizeTimeValue(row.end_time),
    }
}

function validateOvertimeOutsideWorkingHours({ startTime, endTime, schedule }) {
    const startMinutes = parseTimeToMinutes(startTime)
    const endMinutes = parseTimeToMinutes(endTime)
    if (startMinutes == null || endMinutes == null) {
        return 'Invalid time format. Use HH:MM.'
    }

    if (endMinutes <= startMinutes) {
        return 'End time must be later than start time.'
    }

    if (!schedule) {
        return 'No company working-hours schedule found for this date.'
    }

    if (!schedule.isWorkingDay) {
        // Entire day is non-working, so any positive range is valid.
        return null
    }

    const scheduleStartMinutes = parseTimeToMinutes(schedule.startTime ?? '')
    const scheduleEndMinutes = parseTimeToMinutes(schedule.endTime ?? '')
    if (scheduleStartMinutes == null || scheduleEndMinutes == null) {
        return 'Working day schedule is incomplete. Please set start and end working hours.'
    }

    const isOutsideWorkingHours =
        endMinutes <= scheduleStartMinutes || startMinutes >= scheduleEndMinutes

    if (!isOutsideWorkingHours) {
        return 'Overtime must be filed only for non-working hours.'
    }

    return null
}

function formatDurationMinutesLabel(totalMinutes) {
    const safeMinutes = Number(totalMinutes)
    if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) {
        return '0h 0m'
    }

    const hours = Math.floor(safeMinutes / 60)
    const minutes = safeMinutes % 60
    return `${hours}h ${minutes}m`
}

function buildOvertimeLogReason({
    actionLabel,
    startTime,
    endTime,
    totalMinutes,
    purpose,
}) {
    return [
        actionLabel,
        `Start Time: ${startTime}`,
        `End Time: ${endTime}`,
        `OT Duration: ${formatDurationMinutesLabel(totalMinutes)}`,
        `Purpose: ${String(purpose ?? '').trim()}`,
    ].join('\n')
}

function parsePurposeFromOvertimeMessage(message) {
    const text = String(message ?? '')
    const purposePrefix = 'Purpose:'
    const index = text.toLowerCase().indexOf(purposePrefix.toLowerCase())
    if (index === -1) {
        return text.trim()
    }

    return text.slice(index + purposePrefix.length).trim()
}

function mapAttendanceRecordRow(row) {
    const attendanceDate =
        row.attendance_date instanceof Date
            ? row.attendance_date.toISOString().slice(0, 10)
            : row.attendance_date
              ? String(row.attendance_date).slice(0, 10)
              : null

    return {
        attendanceId: Number(row.attendance_id),
        recordType: row.record_type ?? 'actual',
        attendanceDate,
        status: row.status,
        clockIn: row.clock_in ? String(row.clock_in).slice(0, 5) : null,
        clockOut: row.clock_out ? String(row.clock_out).slice(0, 5) : null,
        workDurationMinutes: row.work_duration_minutes,
        lateMinutes: row.late_minutes,
        totalBreakDurationMinutes: row.total_break_duration_minutes ?? 0,
        isBreakActive: Boolean(row.active_break_started_at),
        activeBreakStartedAt: row.active_break_started_at ?? null,
    }
}

function mapAttendanceActivityLogRow(row) {
    return {
        activityId: Number(row.activity_id),
        action: String(row.action),
        loggedAt: row.logged_at,
        metadata:
            row.metadata && typeof row.metadata === 'object'
                ? row.metadata
                : {},
    }
}

async function insertAttendanceActivityLog(
    client,
    { attendanceId, employeeId, action, metadata = {} }
) {
    await client.query(
        `
    INSERT INTO app.attendance_activity_logs (
      attendance_id,
      employee_id,
      action,
      metadata
    )
    VALUES (
      $1::bigint,
      $2::text,
      $3::text,
      $4::jsonb
    )
    `,
        [attendanceId, employeeId, action, metadata]
    )
}

async function computeActiveSessionNetMinutes(
    client,
    {
        nowLocal,
        nowAt,
        attendanceDate,
        clockIn,
        attendanceId,
        attendanceTimeZoneValue,
    }
) {
    const durationResult = await client.query(
        `
    WITH schedule AS (
      SELECT is_working_day, start_time, end_time
      FROM app.company_settings_working_hours
      WHERE iso_day = EXTRACT(ISODOW FROM $2::date)::smallint
      LIMIT 1
    ),
    effective_window AS (
      SELECT
        CASE
          WHEN COALESCE((SELECT is_working_day FROM schedule), false)
            AND (SELECT start_time FROM schedule) IS NOT NULL
            AND (SELECT end_time FROM schedule) IS NOT NULL
          THEN GREATEST(
            ($2::date + $3::time),
            ($2::date + (SELECT start_time FROM schedule))
          )
          ELSE NULL
        END AS effective_start,
        CASE
          WHEN COALESCE((SELECT is_working_day FROM schedule), false)
            AND (SELECT start_time FROM schedule) IS NOT NULL
            AND (SELECT end_time FROM schedule) IS NOT NULL
          THEN LEAST(
            $1::timestamp,
            ($2::date + (SELECT end_time FROM schedule))
          )
          ELSE NULL
        END AS effective_end
    ),
    session_minutes AS (
      SELECT
        CASE
          WHEN effective_start IS NULL OR effective_end IS NULL OR effective_end <= effective_start
            THEN 0
          ELSE FLOOR(EXTRACT(EPOCH FROM (effective_end - effective_start)) / 60)::integer
        END AS gross_session_minutes,
        effective_start,
        effective_end
      FROM effective_window
    ),
    break_minutes AS (
      SELECT COALESCE(SUM(
        GREATEST(
          0,
          FLOOR(
            EXTRACT(EPOCH FROM (
              LEAST((COALESCE(bl.break_ended_at, $6::timestamptz) AT TIME ZONE $5::text), sm.effective_end)
              -
              GREATEST((bl.break_started_at AT TIME ZONE $5::text), sm.effective_start)
            )) / 60
          )::integer
        )
      ), 0)::integer AS session_break_minutes
      FROM app.attendance_break_logs bl
      CROSS JOIN session_minutes sm
      WHERE bl.attendance_id = $4::bigint
        AND sm.effective_start IS NOT NULL
        AND sm.effective_end IS NOT NULL
        AND (bl.break_started_at AT TIME ZONE $5::text) < sm.effective_end
        AND (COALESCE(bl.break_ended_at, $6::timestamptz) AT TIME ZONE $5::text) > sm.effective_start
    )
    SELECT sm.gross_session_minutes, bm.session_break_minutes
    FROM session_minutes sm
    CROSS JOIN break_minutes bm
    `,
        [
            nowLocal,
            attendanceDate,
            clockIn,
            attendanceId,
            attendanceTimeZoneValue,
            nowAt,
        ]
    )

    const grossSessionMinutes =
        durationResult.rows[0]?.gross_session_minutes ?? 0
    const sessionBreakMinutes =
        durationResult.rows[0]?.session_break_minutes ?? 0
    return Math.max(
        0,
        Number(grossSessionMinutes) - Number(sessionBreakMinutes)
    )
}

function mapAdjustmentRequestRow(row) {
    return {
        requestId: row.request_id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        requestDate: row.request_date
            ? String(row.request_date).slice(0, 10)
            : null,
        shiftDateFrom: row.shift_date_from
            ? String(row.shift_date_from).slice(0, 10)
            : null,
        shiftDateTo: row.shift_date_to
            ? String(row.shift_date_to).slice(0, 10)
            : null,
        clockInTime: row.clock_in_time ?? null,
        clockOutTime: row.clock_out_time ?? null,
        reason: row.reason,
        breakDurationMinutes: row.break_duration_minutes,
        totalWorkDurationMinutes: row.total_work_duration_minutes,
        message: row.message,
        status: row.status,
        submittedAt: row.submitted_at,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        deniedReason: row.denied_reason,
        sourcePage: row.source_page,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        logs: Array.isArray(row.logs) ? row.logs : [],
    }
}

function mapOvertimeRequestRow(row) {
    const message = String(row?.message ?? '')
    const purposeMatch = message.match(/Purpose:\s*([\s\S]*)$/im)

    return {
        requestId: row.request_id,
        employeeId: row.employee_id,
        requestDate: row.request_date
            ? String(row.request_date).slice(0, 10)
            : null,
        startTime: row.clock_in_time ?? null,
        endTime: row.clock_out_time ?? null,
        purpose: purposeMatch?.[1]?.trim() ?? message,
        status: row.status,
        submittedAt: row.submitted_at,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        deniedReason: row.denied_reason,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        logs: Array.isArray(row.logs) ? row.logs : [],
    }
}

function getPasswordValidationError(password) {
    if (!/[a-zA-Z]/.test(password)) {
        return 'Password should contain a letter'
    }

    if (!/\d/.test(password)) {
        return 'Password should contain a number'
    }

    if (!passwordSymbolRegex.test(password)) {
        return 'Password should contain a symbol'
    }

    return null
}

const selfProfileUpdateSchema = z
    .object({
        email: z.union([z.string().email(), z.null()]).optional(),
        phone: z.union([z.string().min(3).max(50), z.null()]).optional(),
        birthday: z
            .union([z.string().regex(isoDateRegex), z.null()])
            .optional(),
        gender: z.union([z.string().min(1).max(50), z.null()]).optional(),
        nationality: z.union([z.string().min(1).max(100), z.null()]).optional(),
        maritalStatus: z
            .union([z.string().min(1).max(100), z.null()])
            .optional(),
        address: z.union([z.string().min(3).max(300), z.null()]).optional(),
        departmentId: z
            .union([z.number().int().positive(), z.null()])
            .optional(),
        employmentType: z.enum(employmentTypeOptions).optional(),
        position: z.union([z.string().min(2).max(120), z.null()]).optional(),
        positionId: z.union([z.number().int().positive(), z.null()]).optional(),
        joinDate: z
            .union([z.string().regex(isoDateRegex), z.null()])
            .optional(),
        sssNumber: z.union([z.string().max(50), z.null()]).optional(),
        tinNumber: z.union([z.string().max(50), z.null()]).optional(),
        philhealthNumber: z.union([z.string().max(50), z.null()]).optional(),
        pagibigNumber: z.union([z.string().max(50), z.null()]).optional(),
        profilePictureUrl: z
            .union([
                z.string().url().max(1000),
                z.string().regex(base64ImageDataUrlRegex).max(7000000),
                z.null(),
            ])
            .optional(),
    })
    .refine(payload => Object.keys(payload).length > 0, {
        message: 'At least one field is required',
    })

const hrEmployeeUpdateSchema = z
    .object({
        firstName: z.string().min(1).max(120).optional(),
        lastName: z.string().min(1).max(120).optional(),
        email: z.union([z.string().email(), z.null()]).optional(),
        phone: z.union([z.string().min(3).max(50), z.null()]).optional(),
        birthday: z
            .union([z.string().regex(isoDateRegex), z.null()])
            .optional(),
        gender: z.union([z.string().min(1).max(50), z.null()]).optional(),
        nationality: z.union([z.string().min(1).max(100), z.null()]).optional(),
        maritalStatus: z
            .union([z.string().min(1).max(100), z.null()])
            .optional(),
        address: z.union([z.string().min(3).max(300), z.null()]).optional(),
        departmentId: z
            .union([z.number().int().positive(), z.null()])
            .optional(),
        employmentType: z.enum(employmentTypeOptions).optional(),
        position: z.union([z.string().min(2).max(120), z.null()]).optional(),
        positionId: z.union([z.number().int().positive(), z.null()]).optional(),
        employmentStatus: z
            .enum(['onboarding', 'active', 'inactive'])
            .optional(),
        joinDate: z
            .union([z.string().regex(isoDateRegex), z.null()])
            .optional(),
        invitationSentDate: z
            .union([z.string().regex(isoDateRegex), z.null()])
            .optional(),
        passwordChanged: z.union([z.boolean(), z.null()]).optional(),
        profilePictureUrl: z
            .union([
                z.string().url().max(1000),
                z.string().regex(base64ImageDataUrlRegex).max(7000000),
                z.null(),
            ])
            .optional(),
    })
    .refine(payload => Object.keys(payload).length > 0, {
        message: 'At least one field is required',
    })

const hrEmployeeCreateSchema = z.object({
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    email: z.union([z.string().email(), z.null()]).optional(),
    phone: z.union([z.string().min(3).max(50), z.null()]).optional(),
    birthday: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
    gender: z.union([z.string().min(1).max(50), z.null()]).optional(),
    nationality: z.union([z.string().min(1).max(100), z.null()]).optional(),
    maritalStatus: z.union([z.string().min(1).max(100), z.null()]).optional(),
    address: z.union([z.string().min(3).max(300), z.null()]).optional(),
    departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
    employmentType: z.enum(employmentTypeOptions),
    position: z.union([z.string().min(2).max(120), z.null()]).optional(),
    positionId: z.union([z.number().int().positive(), z.null()]).optional(),
    employmentStatus: z.enum(['onboarding', 'active', 'inactive']).optional(),
    joinDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
    invitationSentDate: z
        .union([z.string().regex(isoDateRegex), z.null()])
        .optional(),
    passwordChanged: z.union([z.boolean(), z.null()]).optional(),
    profilePictureUrl: z
        .union([
            z.string().url().max(1000),
            z.string().regex(base64ImageDataUrlRegex).max(7000000),
            z.null(),
        ])
        .optional(),
})

const hrPayrollUpdateSchema = z.object({
    salary: z.number().nonnegative(),
    governmentIds: z.object({
        pagIbig: z.string().max(50),
        philHealth: z.string().max(50),
        sss: z.string().max(50),
        tin: z.string().max(50),
    }),
    deductions: z
        .array(
            z.object({
                id: z.string().min(1).max(120).optional(),
                name: z.string().min(1).max(120),
                amount: z.number().nonnegative(),
            })
        )
        .max(100),
})

async function getUserProfileByUserId(userId) {
    const profileResult = await query(
        `
    SELECT u.user_id, u.email, u.employee_id,
           e.first_name, e.last_name
        FROM app_auth.users u
    LEFT JOIN app.employees e ON e.employee_id = u.employee_id
    WHERE u.user_id = $1::uuid
    `,
        [userId]
    )
    return profileResult.rows[0] ?? null
}

function buildDummyGovernmentIds(seedSource) {
    const seed = String(seedSource).replace(/\D/g, '') || '12345678901234567890'
    const doubled = `${seed}${seed}${seed}`

    return {
        sss: `${doubled.slice(0, 2)}-${doubled.slice(2, 9)}-${doubled.slice(9, 10)}`,
        tin: `${doubled.slice(0, 3)}-${doubled.slice(3, 6)}-${doubled.slice(6, 9)}-${doubled.slice(9, 12)}`,
        philHealth: `${doubled.slice(0, 2)}-${doubled.slice(2, 11)}-${doubled.slice(11, 12)}`,
        pagIbig: `${doubled.slice(0, 4)}-${doubled.slice(4, 8)}-${doubled.slice(8, 12)}`,
    }
}

async function ensureEmployeeLinkForUser(userId) {
    const userResult = await query(
        `
    SELECT user_id, employee_id, email
    FROM app_auth.users
    WHERE user_id = $1::uuid
    `,
        [userId]
    )

    const userRow = userResult.rows[0] ?? null
    if (!userRow) {
        return null
    }

    if (userRow.employee_id) {
        return userRow.employee_id
    }

    if (!userRow.email) {
        return null
    }

    const employeeResult = await query(
        `
    SELECT employee_id
    FROM app.employees
    WHERE email = $1::citext
    LIMIT 1
    `,
        [userRow.email]
    )

    const resolvedEmployeeId = employeeResult.rows[0]?.employee_id ?? null
    if (!resolvedEmployeeId) {
        const emailLocalPart = String(userRow.email).split('@')[0] || 'employee'
        const nameParts = emailLocalPart
            .split(/[._-]+/)
            .filter(Boolean)
            .map(
                part =>
                    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )

        const firstName = nameParts[0] || 'Employee'
        const lastName = nameParts.slice(1).join(' ') || 'User'

        const autoEmployeeId = `AUTO-${String(userId).replace(/-/g, '').slice(0, 12).toUpperCase()}`
        const autoEmployeeCode = `EMP-${String(userId).replace(/-/g, '').slice(0, 8).toUpperCase()}`
        const dummyIds = buildDummyGovernmentIds(userId)

        await query(
            `
      INSERT INTO app.employees (
        employee_id,
        employee_code,
        first_name,
        last_name,
        email,
        position,
        employment_status,
        attendance_status,
        employment_type,
        password_changed,
        join_date,
        invitation_sent_date
      )
      VALUES (
        $1::text,
        $2::text,
        $3::text,
        $4::text,
        $5::citext,
        'Employee',
        'active'::app.employment_status,
        'present'::app.attendance_status,
        'full-time'::app.employment_type,
        false,
        CURRENT_DATE,
        CURRENT_DATE
      )
      ON CONFLICT (employee_id) DO NOTHING
      `,
            [
                autoEmployeeId,
                autoEmployeeCode,
                firstName,
                lastName,
                userRow.email,
            ]
        )

        await query(
            `
      INSERT INTO app.payroll_profiles (employee_id, salary, sss, tin, phil_health, pag_ibig)
      VALUES ($1::text, 0, $2::text, $3::text, $4::text, $5::text)
      ON CONFLICT (employee_id) DO NOTHING
      `,
            [
                autoEmployeeId,
                dummyIds.sss,
                dummyIds.tin,
                dummyIds.philHealth,
                dummyIds.pagIbig,
            ]
        )

        await query(
            `
      UPDATE app_auth.users
      SET employee_id = $1::text
      WHERE user_id = $2::uuid
      `,
            [autoEmployeeId, userId]
        )

        return autoEmployeeId
    }

    await query(
        `
    UPDATE app_auth.users
    SET employee_id = $1::text
    WHERE user_id = $2::uuid
    `,
        [resolvedEmployeeId, userId]
    )

    return resolvedEmployeeId
}

async function seedCalendarSampleAttendanceIfEmpty(authContext) {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(
        authContext.userId
    )
    if (!resolvedEmployeeId) {
        return { seeded: false, inserted: 0 }
    }

    return withRlsContext(authContext, async client => {
        const existingResult = await client.query(
            `
      SELECT 1
      FROM app.attendance_records
      WHERE employee_id = $1::text
        AND record_type = 'actual'::app.attendance_record_type
      LIMIT 1
      `,
            [resolvedEmployeeId]
        )

        if (existingResult.rowCount > 0) {
            return { seeded: false, inserted: 0 }
        }

        let inserted = 0
        for (const [attendanceDate, status] of Object.entries(
            calendarSampleStatusByDate
        )) {
            const timing = calendarSampleTimingByStatus[status]
            const insertResult = await client.query(
                `
        INSERT INTO app.attendance_records (
          employee_id,
          attendance_date,
          record_type,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes
        )
        VALUES (
          $1::text,
          $2::date,
          'actual'::app.attendance_record_type,
          $3::app.attendance_status,
          $4::time,
          $5::time,
          $6::integer,
          $7::integer
        )
        ON CONFLICT DO NOTHING
        `,
                [
                    resolvedEmployeeId,
                    attendanceDate,
                    status,
                    timing.clockIn,
                    timing.clockOut,
                    timing.workDurationMinutes,
                    timing.lateMinutes,
                ]
            )
            inserted += insertResult.rowCount
        }

        return { seeded: inserted > 0, inserted }
    })
}

function toIsoDateString(value) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
        return null
    }
    return date.toISOString().slice(0, 10)
}

function buildAttendanceSyncRange(from, to, fallbackDays = 120) {
    const today = new Date()
    const fallbackFrom = new Date(today)
    fallbackFrom.setDate(fallbackFrom.getDate() - fallbackDays)

    let start =
        typeof from === 'string' && isoDateRegex.test(from)
            ? from
            : toIsoDateString(fallbackFrom)
    let end =
        typeof to === 'string' && isoDateRegex.test(to)
            ? to
            : toIsoDateString(today)

    if (!start || !end) {
        const nowIso = toIsoDateString(new Date()) ?? '1970-01-01'
        return { startDate: nowIso, endDate: nowIso }
    }

    if (start > end) {
        const temp = start
        start = end
        end = temp
    }

    return { startDate: start, endDate: end }
}

async function syncAbsentAttendanceForRange(
    authContext,
    employeeId,
    startDate,
    endDate
) {
    return withRlsContext(authContext, async client => {
        await client.query(
            `
      WITH local_now AS (
        SELECT
          (NOW() AT TIME ZONE $4::text)::date AS local_today,
          (NOW() AT TIME ZONE $4::text)::time AS local_time
      ),
      working_days AS (
        SELECT
          gs::date AS day_date,
          c.start_time,
          c.end_time
        FROM generate_series($2::date, $3::date, INTERVAL '1 day') gs
        JOIN app.company_settings_working_hours c
          ON c.iso_day = EXTRACT(ISODOW FROM gs)::smallint
        WHERE c.is_working_day = TRUE
          AND c.start_time IS NOT NULL
          AND c.end_time IS NOT NULL
      ),
      due_days AS (
        SELECT
          wd.day_date,
          wd.start_time,
          wd.end_time,
          EXISTS (
            SELECT 1
            FROM app.attendance_activity_logs al
            WHERE al.employee_id = $1::text
              AND (al.logged_at AT TIME ZONE $4::text)::date = wd.day_date
              AND (al.logged_at AT TIME ZONE $4::text)::time >= wd.start_time
              AND (al.logged_at AT TIME ZONE $4::text)::time <= wd.end_time
          ) AS has_in_hours_logs
        FROM working_days wd
        CROSS JOIN local_now ln
        WHERE wd.day_date < ln.local_today
           OR (wd.day_date = ln.local_today AND ln.local_time >= wd.end_time)
      )
      INSERT INTO app.attendance_records (
        employee_id,
        attendance_date,
        record_type,
        status,
        clock_in,
        clock_out,
        work_duration_minutes,
        late_minutes,
        total_break_duration_minutes,
        active_break_started_at
      )
      SELECT
        $1::text,
        dd.day_date,
        'actual'::app.attendance_record_type,
        'absent'::app.attendance_status,
        NULL,
        NULL,
        0,
        0,
        0,
        NULL
      FROM due_days dd
      WHERE dd.has_in_hours_logs = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM app.attendance_records ar
          WHERE ar.employee_id = $1::text
            AND ar.attendance_date = dd.day_date
            AND ar.record_type = 'actual'::app.attendance_record_type
        )
      ON CONFLICT DO NOTHING
      `,
            [employeeId, startDate, endDate, attendanceTimeZone]
        )

        // Keep existing actual attendance rows stable; this sync only backfills missing
        // due working days as absent and must not overwrite explicit/manual statuses.
    })
}

async function getEmployeeRowForApi(client, employeeId) {
    const result = await client.query(
        `
    SELECT
      e.employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.email,
      e.phone,
      d.name AS department,
      e.position_id,
      COALESCE(jp.name, e.position) AS position,
      CASE
        WHEN ta.status = 'absent'::app.attendance_status THEN 'absent'::app.attendance_status
        WHEN ta.status = 'on-leave'::app.attendance_status THEN 'on-leave'::app.attendance_status
        WHEN ta.status IN ('present'::app.attendance_status, 'late'::app.attendance_status)
          THEN 'present'::app.attendance_status
                ELSE 'absent'::app.attendance_status
      END AS attendance_status,
      e.employment_status,
      e.employment_type,
    ta.attendance_date AS status_date,
      ta.clock_in,
      ta.clock_out,
            ta.work_duration_minutes,
            ta.late_minutes,
      ta.active_break_started_at,
      e.join_date,
      e.birthday,
      e.gender,
      e.nationality,
      e.marital_status,
      e.address,
      e.invitation_sent_date,
      e.password_changed,
      e.profile_picture_url,
      pp.salary,
      pp.sss,
      pp.tin,
      pp.phil_health,
      pp.pag_ibig,
      COALESCE(pd.items, '[]'::jsonb) AS payroll_deductions
    FROM app.employees e
    LEFT JOIN app.departments d ON d.department_id = e.department_id
    LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
    LEFT JOIN LATERAL (
      SELECT
        ar.status,
        ar.attendance_date,
        ar.clock_in,
        ar.clock_out,
        ar.work_duration_minutes,
        ar.late_minutes,
        ar.active_break_started_at
      FROM app.attendance_records ar
      WHERE ar.employee_id = e.employee_id
        AND ar.attendance_date = (NOW() AT TIME ZONE $2::text)::date
        AND ar.record_type = 'actual'::app.attendance_record_type
      ORDER BY ar.attendance_id DESC
      LIMIT 1
    ) ta ON TRUE
    LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'deduction_id', d2.deduction_id,
          'deduction_name', d2.deduction_name,
          'amount', d2.amount
        )
        ORDER BY d2.deduction_id
      ) AS items
      FROM app.payroll_deductions d2
      WHERE d2.employee_id = e.employee_id
    ) pd ON TRUE
    WHERE e.employee_id = $1::text
    `,
        [employeeId, attendanceTimeZone]
    )

    return result.rows[0] ?? null
}

async function getAdjustmentRequestByIdForApi(client, requestId) {
    const result = await client.query(
        `
    SELECT
      r.request_id,
      r.employee_id,
      r.employee_name,
      r.position,
      r.department,
      r.request_date::text AS request_date,
      r.shift_date_from::text AS shift_date_from,
      r.shift_date_to::text AS shift_date_to,
      r.clock_in_time,
      r.clock_out_time,
      r.reason,
      r.break_duration_minutes,
      r.total_work_duration_minutes,
      r.message,
      r.status,
      r.submitted_at,
      r.approved_by,
      r.approved_at,
      r.denied_reason,
      r.source_page,
      COALESCE(a.items, '[]'::jsonb) AS attachments,
      COALESCE(l.items, '[]'::jsonb) AS logs
    FROM app.attendance_adjustment_requests r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'attachmentId', att.attachment_id,
          'fileName', att.file_name
        )
        ORDER BY att.attachment_id
      ) AS items
      FROM app.adjustment_request_attachments att
      WHERE att.request_id = r.request_id
    ) a ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'logId', lg.log_id,
          'status', lg.status,
          'loggedAt', lg.logged_at,
          'approvedBy', lg.approved_by,
          'reason', lg.reason
        )
        ORDER BY lg.logged_at ASC
      ) AS items
      FROM app.adjustment_request_logs lg
      WHERE lg.request_id = r.request_id
    ) l ON TRUE
    WHERE r.request_id = $1::text
    LIMIT 1
    `,
        [requestId]
    )

    return result.rows[0] ?? null
}

async function resolveEmployeeId(client, employeeIdentifier) {
    const result = await client.query(
        `
    SELECT e.employee_id
    FROM app.employees e
    WHERE e.employee_id = $1::text
       OR e.employee_code = $1::text
       OR LOWER(e.employee_id) = LOWER($1::text)
       OR LOWER(e.employee_code) = LOWER($1::text)
    ORDER BY
      CASE
        WHEN e.employee_id = $1::text THEN 1
        WHEN e.employee_code = $1::text THEN 2
        WHEN LOWER(e.employee_id) = LOWER($1::text) THEN 3
        ELSE 4
      END
    LIMIT 1
    `,
        [employeeIdentifier]
    )

    return result.rows[0]?.employee_id ?? null
}

async function isEmailTakenByAnotherEmployee(client, email, employeeId = null) {
    const normalizedEmail = typeof email === 'string' ? email.trim() : ''
    if (!normalizedEmail) {
        return false
    }

    const result = employeeId
        ? await client.query(
              `
      SELECT 1
      FROM app.employees
      WHERE email = $1::citext
        AND employee_id <> $2::text
      LIMIT 1
      `,
              [normalizedEmail, employeeId]
          )
        : await client.query(
              `
      SELECT 1
      FROM app.employees
      WHERE email = $1::citext
      LIMIT 1
      `,
              [normalizedEmail]
          )

    return result.rowCount > 0
}

registerAuthRoutes(app, {
    query,
    signAccessToken,
    randomBytes,
    requireAuth,
    requireRole,
    loginSchema,
    refreshSchema,
    supabaseTokenExchangeSchema,
    biometricLoginSchema,
    getUserProfileByUserId,
    ensureEmployeeLinkForUser,
    fetchSupabaseUserFromAccessToken,
    normalizeRoleName,
})

registerMeRoutes(app, {
    requireAuth,
    query,
    pool,
    withRlsContext,
    attendanceTimeZone,
    ensureEmployeeLinkForUser,
    selfProfileUpdateSchema,
    mapSecurityPreferenceRow,
    mapPasswordActivityRow,
    securityPreferenceCreateSchema,
    securityPreferenceUpdateSchema,
    updatePasswordSchema,
    getPasswordValidationError,
    buildAttendanceSyncRange,
    syncAbsentAttendanceForRange,
    mapAttendanceRecordRow,
    mapAttendanceActivityLogRow,
    computeActiveSessionNetMinutes,
    insertAttendanceActivityLog,
    isoDateRegex,
    mapAdjustmentRequestRow,
    attendanceAdjustmentCreateSchema,
    attendanceAdjustmentUpdateSchema,
    computeTotalWorkDurationMinutes,
    getAdjustmentRequestByIdForApi,
    mapOvertimeRequestRow,
    overtimeRequestCreateSchema,
    overtimeRequestUpdateSchema,
    leaveRequestCreateSchema,
    getWorkingScheduleForDate,
    validateOvertimeOutsideWorkingHours,
    buildOvertimeLogReason,
    parsePurposeFromOvertimeMessage,
    seedCalendarSampleAttendanceIfEmpty,
})

registerSettingsRoutes(app, {
    query,
    pool,
    requireAuth,
    requireRole,
    companyWorkingHourCreateSchema,
    companyWorkingHourBulkSchema,
    companyWorkingHourUpdateSchema,
    buildScheduleValidationError,
    isoDayByName,
    mapCompanyWorkingHourRow,
    normalizeTimeValue,
})

registerEmployeeRoutes(app, {
    query,
    withRlsContext,
    requireAuth,
    requireRole,
    attendanceTimeZone,
    hrEmployeeCreateSchema,
    hrEmployeeUpdateSchema,
    hrPayrollUpdateSchema,
    isEmailTakenByAnotherEmployee,
    getEmployeeRowForApi,
    resolveEmployeeId,
})

if (process.argv.includes('--check')) {
    const hasSupabaseConfig =
        Boolean(supabase.url) &&
        Boolean(supabase.publishableKey) &&
        Boolean(supabase.secretKey) &&
        Boolean(supabase.jwksUrl)
    const hasDatabaseConfig =
        Boolean(database.host) &&
        Number.isFinite(database.port) &&
        Boolean(database.database) &&
        Boolean(database.user)

    console.log('API configuration check passed.')
    console.log(`Port: ${port}`)
    console.log(`Supabase config loaded: ${hasSupabaseConfig}`)
    console.log(`Database config loaded: ${hasDatabaseConfig}`)
    process.exit(0)
}

const server = app.listen(port, () => {
    const hasSupabaseConfig =
        Boolean(supabase.url) &&
        Boolean(supabase.publishableKey) &&
        Boolean(supabase.secretKey) &&
        Boolean(supabase.jwksUrl)
    const hasDatabaseConfig =
        Boolean(database.host) &&
        Number.isFinite(database.port) &&
        Boolean(database.database) &&
        Boolean(database.user)

    console.log(`WFH-PULSE API listening on http://localhost:${port}`)
    console.log(`Supabase config loaded: ${hasSupabaseConfig}`)
    console.log(`Database config loaded: ${hasDatabaseConfig}`)
})

process.on('SIGINT', async () => {
    server.close(async () => {
        await pool.end().catch(() => {
            // Ignore pool close errors.
        })
        process.exit(0)
    })
})
