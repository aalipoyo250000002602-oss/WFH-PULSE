import express from "express";
import cors from "cors";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getApiConfig } from "./config.mjs";
import { query, withRlsContext, pool } from "./db.mjs";
import { signAccessToken } from "./auth.mjs";
import { requireAuth, requireRole } from "./middleware.mjs";

const app = express();
const { port, envPath } = getApiConfig();

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const dbResult = await query("SELECT NOW() AS now");
    return res.json({
      ok: true,
      dbTime: dbResult.rows[0].now,
      envPath,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  sessionId: z.string().uuid(),
  refreshToken: z.string().min(1),
});

const biometricLoginSchema = z.object({
  email: z.string().email().optional(),
});

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const base64ImageDataUrlRegex =
  /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const calendarSampleStatusByDate = {
  "2025-10-01": "present",
  "2025-10-02": "present",
  "2025-10-03": "late",
  "2025-10-06": "present",
  "2025-10-07": "present",
  "2025-10-08": "present",
  "2025-10-09": "late",
  "2025-10-10": "present",
  "2025-10-13": "present",
  "2025-10-14": "present",
  "2025-10-15": "absent",
  "2025-10-16": "on-leave",
  "2025-10-17": "present",
  "2025-10-20": "present",
  "2025-10-21": "late",
  "2025-10-22": "present",
  "2025-10-23": "present",
  "2025-10-24": "present",
  "2025-10-27": "present",
  "2025-10-28": "present",
  "2025-10-29": "late",
  "2025-10-30": "present",
  "2025-10-31": "present",
  "2025-09-01": "present",
  "2025-09-02": "present",
  "2025-09-03": "absent",
  "2025-09-04": "present",
  "2025-09-05": "present",
  "2025-09-08": "present",
  "2025-09-09": "present",
  "2025-09-10": "late",
  "2025-09-11": "present",
  "2025-09-12": "present",
  "2025-09-15": "absent",
  "2025-09-16": "present",
  "2025-09-17": "present",
  "2025-09-18": "present",
  "2025-09-19": "late",
  "2025-09-22": "present",
  "2025-09-23": "present",
  "2025-09-24": "absent",
  "2025-09-25": "present",
  "2025-09-26": "late",
  "2025-09-29": "present",
  "2025-09-30": "present",
  "2025-11-03": "present",
  "2025-11-04": "present",
  "2025-11-05": "present",
  "2025-11-06": "late",
  "2025-11-07": "present",
  "2025-11-10": "present",
  "2025-11-12": "present",
  "2025-11-13": "present",
  "2025-11-14": "present",
  "2025-11-17": "present",
  "2025-11-18": "present",
  "2025-11-19": "late",
  "2025-11-20": "present",
  "2025-11-21": "present",
  "2025-11-24": "present",
  "2025-11-25": "present",
  "2025-11-26": "on-leave",
  "2025-08-18": "present",
  "2025-08-19": "present",
  "2025-08-20": "late",
  "2025-08-21": "present",
  "2025-08-22": "present",
  "2025-08-25": "present",
  "2025-08-26": "present",
  "2025-08-27": "present",
  "2025-08-28": "absent",
  "2025-08-29": "present",
  "2026-06-01": "present",
  "2026-06-02": "present",
  "2026-06-03": "present",
  "2026-06-04": "present",
  "2026-06-05": "late",
  "2026-06-08": "present",
  "2026-06-09": "present",
  "2026-06-10": "present",
  "2026-06-11": "absent",
  "2026-06-12": "holiday",
  "2026-06-15": "on-leave",
  "2026-06-16": "present",
  "2026-06-17": "present",
  "2026-06-18": "present",
  "2026-06-19": "late",
  "2026-06-22": "present",
  "2026-06-23": "present",
  "2026-06-24": "present",
  "2026-06-25": "present",
  "2026-06-26": "present",
  "2026-06-29": "present",
  "2026-06-30": "present",
  "2026-07-01": "present",
  "2026-07-02": "present",
  "2026-07-03": "present",
  "2026-07-06": "present",
  "2026-07-07": "late",
  "2026-07-08": "present",
  "2026-07-09": "present",
  "2026-07-10": "present",
  "2026-07-13": "present",
  "2026-07-14": "on-leave",
  "2026-07-15": "absent",
  "2026-07-16": "present",
  "2026-07-17": "present",
  "2026-07-20": "late",
  "2026-07-21": "present",
};

const calendarSampleTimingByStatus = {
  present: {
    clockIn: "08:55",
    clockOut: "17:10",
    workDurationMinutes: 495,
    lateMinutes: 0,
  },
  late: {
    clockIn: "09:20",
    clockOut: "17:30",
    workDurationMinutes: 490,
    lateMinutes: 20,
  },
  absent: {
    clockIn: null,
    clockOut: null,
    workDurationMinutes: null,
    lateMinutes: 0,
  },
  "on-leave": {
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
};
const employmentTypeOptions = [
  "full-time",
  "independent contractor",
  "part-time",
  "intern",
  "contract-to-hire",
  "project-based",
  "temporary",
  "consultant",
  "freelance",
  "apprentice",
];
const isoTimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const workingDayOptions = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const isoDayByName = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};
const attendanceTimeZone = process.env.ATTENDANCE_TIMEZONE ?? process.env.APP_TIMEZONE ?? "Asia/Manila";

function normalizeTimeValue(value) {
  if (value == null) {
    return null;
  }

  const str = String(value);
  if (!str) {
    return null;
  }

  return str.slice(0, 5);
}

function buildScheduleValidationError({ day, isWorkingDay, startTime, endTime }) {
  if (!workingDayOptions.includes(day)) {
    return "Invalid day value";
  }

  if (!isWorkingDay) {
    if (startTime !== null || endTime !== null) {
      return "Rest days must not have startTime or endTime";
    }
    return null;
  }

  if (startTime == null || endTime == null) {
    return "Working days must include startTime and endTime";
  }

  if (!isoTimeRegex.test(startTime) || !isoTimeRegex.test(endTime)) {
    return "Invalid time format. Use HH:MM";
  }

  if (startTime >= endTime) {
    return "startTime must be earlier than endTime";
  }

  return null;
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
  };
}

const companyWorkingHourCreateSchema = z.object({
  day: z.enum(workingDayOptions),
  isWorkingDay: z.boolean(),
  startTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
  endTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
});

const companyWorkingHourUpdateSchema = z
  .object({
    day: z.enum(workingDayOptions).optional(),
    isWorkingDay: z.boolean().optional(),
    startTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
    endTime: z.union([z.string().regex(isoTimeRegex), z.null()]).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const companyWorkingHourBulkSchema = z.object({
  days: z.array(companyWorkingHourCreateSchema).min(1).max(7),
});

const passwordSymbolRegex = /[!@#$%^&*(),.?":{}|<>]/;

const securityPreferenceCreateSchema = z.object({
  biometricLogin: z.boolean().default(false),
  biometricClockInOut: z.boolean().default(false),
  passwordWaived: z.boolean().default(false),
  darkModeEnabled: z.boolean().optional(),
});

const securityPreferenceUpdateSchema = z
  .object({
    biometricLogin: z.boolean().optional(),
    biometricClockInOut: z.boolean().optional(),
    passwordWaived: z.boolean().optional(),
    darkModeEnabled: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const updatePasswordSchema = z.object({
  newPassword: z.string().min(8).max(30),
  waivePassword: z.boolean().default(false),
  platform: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(40).optional(),
  details: z.record(z.any()).optional(),
});

const adjustmentReasonOptions = ["Forgot to Clock-in/Clock-out", "Missing logs"];
const adjustmentStatusOptions = ["pending", "approved", "denied", "cancelled"];

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
});

const attendanceAdjustmentUpdateSchema = attendanceAdjustmentCreateSchema;

function mapSecurityPreferenceRow(row) {
  return {
    biometricLogin: row.biometric_login,
    biometricClockInOut: row.biometric_clock_in_out,
    passwordWaived: row.password_waived,
    darkModeEnabled: row.dark_mode_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  };
}

function parseTimeToMinutes(value) {
  if (!isoTimeRegex.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function computeTotalWorkDurationMinutes(clockInTime, clockOutTime, breakDurationMinutes) {
  const clockInMinutes = parseTimeToMinutes(clockInTime);
  const clockOutMinutes = parseTimeToMinutes(clockOutTime);
  if (clockInMinutes == null || clockOutMinutes == null) {
    return null;
  }

  const total = clockOutMinutes - clockInMinutes - Number(breakDurationMinutes);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return total;
}

function mapAttendanceRecordRow(row) {
  const attendanceDate =
    row.attendance_date instanceof Date
      ? row.attendance_date.toISOString().slice(0, 10)
      : row.attendance_date
        ? String(row.attendance_date).slice(0, 10)
        : null;

  return {
    attendanceId: Number(row.attendance_id),
    attendanceDate,
    status: row.status,
    clockIn: row.clock_in ? String(row.clock_in).slice(0, 5) : null,
    clockOut: row.clock_out ? String(row.clock_out).slice(0, 5) : null,
    workDurationMinutes: row.work_duration_minutes,
    lateMinutes: row.late_minutes,
    totalBreakDurationMinutes: row.total_break_duration_minutes ?? 0,
    isBreakActive: Boolean(row.active_break_started_at),
    activeBreakStartedAt: row.active_break_started_at ?? null,
  };
}

function mapAttendanceActivityLogRow(row) {
  return {
    activityId: Number(row.activity_id),
    action: String(row.action),
    loggedAt: row.logged_at,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

async function insertAttendanceActivityLog(client, {
  attendanceId,
  employeeId,
  action,
  metadata = {},
}) {
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
    [attendanceId, employeeId, action, metadata],
  );
}

async function computeActiveSessionNetMinutes(client, {
  nowLocal,
  nowAt,
  attendanceDate,
  clockIn,
  attendanceId,
  attendanceTimeZoneValue,
}) {
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
    [nowLocal, attendanceDate, clockIn, attendanceId, attendanceTimeZoneValue, nowAt],
  );

  const grossSessionMinutes = durationResult.rows[0]?.gross_session_minutes ?? 0;
  const sessionBreakMinutes = durationResult.rows[0]?.session_break_minutes ?? 0;
  return Math.max(0, Number(grossSessionMinutes) - Number(sessionBreakMinutes));
}

function mapAdjustmentRequestRow(row) {
  return {
    requestId: row.request_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    position: row.position,
    department: row.department,
    requestDate: row.request_date ? String(row.request_date).slice(0, 10) : null,
    shiftDateFrom: row.shift_date_from ? String(row.shift_date_from).slice(0, 10) : null,
    shiftDateTo: row.shift_date_to ? String(row.shift_date_to).slice(0, 10) : null,
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
  };
}

function getPasswordValidationError(password) {
  if (!/[a-zA-Z]/.test(password)) {
    return "Password should contain a letter";
  }

  if (!/\d/.test(password)) {
    return "Password should contain a number";
  }

  if (!passwordSymbolRegex.test(password)) {
    return "Password should contain a symbol";
  }

  return null;
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
    maritalStatus: z.union([z.string().min(1).max(100), z.null()]).optional(),
    address: z.union([z.string().min(3).max(300), z.null()]).optional(),
    departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
    employmentType: z.enum(employmentTypeOptions).optional(),
    position: z.union([z.string().min(2).max(120), z.null()]).optional(),
    positionId: z.union([z.number().int().positive(), z.null()]).optional(),
    joinDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
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
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const hrEmployeeUpdateSchema = z
  .object({
    firstName: z.string().min(1).max(120).optional(),
    lastName: z.string().min(1).max(120).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    phone: z.union([z.string().min(3).max(50), z.null()]).optional(),
    birthday: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
    gender: z.union([z.string().min(1).max(50), z.null()]).optional(),
    nationality: z.union([z.string().min(1).max(100), z.null()]).optional(),
    maritalStatus: z.union([z.string().min(1).max(100), z.null()]).optional(),
    address: z.union([z.string().min(3).max(300), z.null()]).optional(),
    departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
    employmentType: z.enum(employmentTypeOptions).optional(),
    position: z.union([z.string().min(2).max(120), z.null()]).optional(),
    positionId: z.union([z.number().int().positive(), z.null()]).optional(),
    employmentStatus: z.enum(["onboarding", "active", "inactive"]).optional(),
    joinDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
    invitationSentDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
    passwordChanged: z.union([z.boolean(), z.null()]).optional(),
    profilePictureUrl: z
      .union([
        z.string().url().max(1000),
        z.string().regex(base64ImageDataUrlRegex).max(7000000),
        z.null(),
      ])
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

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
  employmentStatus: z.enum(["onboarding", "active", "inactive"]).optional(),
  joinDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
  invitationSentDate: z.union([z.string().regex(isoDateRegex), z.null()]).optional(),
  passwordChanged: z.union([z.boolean(), z.null()]).optional(),
  profilePictureUrl: z
    .union([
      z.string().url().max(1000),
      z.string().regex(base64ImageDataUrlRegex).max(7000000),
      z.null(),
    ])
    .optional(),
});

const hrPayrollUpdateSchema = z.object({
  salary: z.number().nonnegative(),
  governmentIds: z.object({
    pagIbig: z.string().max(50),
    philHealth: z.string().max(50),
    sss: z.string().max(50),
    tin: z.string().max(50),
  }),
  deductions: z.array(
    z.object({
      id: z.string().min(1).max(120).optional(),
      name: z.string().min(1).max(120),
      amount: z.number().nonnegative(),
    }),
  ).max(100),
});

async function getUserProfileByUserId(userId) {
  const profileResult = await query(
    `
    SELECT u.user_id, u.email, u.employee_id,
           e.first_name, e.last_name
        FROM app_auth.users u
    LEFT JOIN app.employees e ON e.employee_id = u.employee_id
    WHERE u.user_id = $1::uuid
    `,
    [userId],
  );
  return profileResult.rows[0] ?? null;
}

function buildDummyGovernmentIds(seedSource) {
  const seed = String(seedSource).replace(/\D/g, "") || "12345678901234567890";
  const doubled = `${seed}${seed}${seed}`;

  return {
    sss: `${doubled.slice(0, 2)}-${doubled.slice(2, 9)}-${doubled.slice(9, 10)}`,
    tin: `${doubled.slice(0, 3)}-${doubled.slice(3, 6)}-${doubled.slice(6, 9)}-${doubled.slice(9, 12)}`,
    philHealth: `${doubled.slice(0, 2)}-${doubled.slice(2, 11)}-${doubled.slice(11, 12)}`,
    pagIbig: `${doubled.slice(0, 4)}-${doubled.slice(4, 8)}-${doubled.slice(8, 12)}`,
  };
}

async function ensureEmployeeLinkForUser(userId) {
  const userResult = await query(
    `
    SELECT user_id, employee_id, email
    FROM app_auth.users
    WHERE user_id = $1::uuid
    `,
    [userId],
  );

  const userRow = userResult.rows[0] ?? null;
  if (!userRow) {
    return null;
  }

  if (userRow.employee_id) {
    return userRow.employee_id;
  }

  if (!userRow.email) {
    return null;
  }

  const employeeResult = await query(
    `
    SELECT employee_id
    FROM app.employees
    WHERE email = $1::citext
    LIMIT 1
    `,
    [userRow.email],
  );

  const resolvedEmployeeId = employeeResult.rows[0]?.employee_id ?? null;
  if (!resolvedEmployeeId) {
    const emailLocalPart = String(userRow.email).split("@")[0] || "employee";
    const nameParts = emailLocalPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

    const firstName = nameParts[0] || "Employee";
    const lastName = nameParts.slice(1).join(" ") || "User";

    const autoEmployeeId = `AUTO-${String(userId).replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const autoEmployeeCode = `EMP-${String(userId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const dummyIds = buildDummyGovernmentIds(userId);

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
      [autoEmployeeId, autoEmployeeCode, firstName, lastName, userRow.email],
    );

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
      ],
    );

    await query(
      `
      UPDATE app_auth.users
      SET employee_id = $1::text
      WHERE user_id = $2::uuid
      `,
      [autoEmployeeId, userId],
    );

    return autoEmployeeId;
  }

  await query(
    `
    UPDATE app_auth.users
    SET employee_id = $1::text
    WHERE user_id = $2::uuid
    `,
    [resolvedEmployeeId, userId],
  );

  return resolvedEmployeeId;
}

async function seedCalendarSampleAttendanceIfEmpty(authContext) {
  const resolvedEmployeeId = await ensureEmployeeLinkForUser(authContext.userId);
  if (!resolvedEmployeeId) {
    return { seeded: false, inserted: 0 };
  }

  return withRlsContext(authContext, async (client) => {
    const existingResult = await client.query(
      `
      SELECT 1
      FROM app.attendance_records
      WHERE employee_id = $1::text
      LIMIT 1
      `,
      [resolvedEmployeeId],
    );

    if (existingResult.rowCount > 0) {
      return { seeded: false, inserted: 0 };
    }

    let inserted = 0;
    for (const [attendanceDate, status] of Object.entries(calendarSampleStatusByDate)) {
      const timing = calendarSampleTimingByStatus[status];
      const insertResult = await client.query(
        `
        INSERT INTO app.attendance_records (
          employee_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes
        )
        VALUES (
          $1::text,
          $2::date,
          $3::app.attendance_status,
          $4::time,
          $5::time,
          $6::integer,
          $7::integer
        )
        ON CONFLICT (employee_id, attendance_date) DO NOTHING
        `,
        [
          resolvedEmployeeId,
          attendanceDate,
          status,
          timing.clockIn,
          timing.clockOut,
          timing.workDurationMinutes,
          timing.lateMinutes,
        ],
      );
      inserted += insertResult.rowCount;
    }

    return { seeded: inserted > 0, inserted };
  });
}

function toIsoDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function buildAttendanceSyncRange(from, to, fallbackDays = 120) {
  const today = new Date();
  const fallbackFrom = new Date(today);
  fallbackFrom.setDate(fallbackFrom.getDate() - fallbackDays);

  let start = typeof from === "string" && isoDateRegex.test(from) ? from : toIsoDateString(fallbackFrom);
  let end = typeof to === "string" && isoDateRegex.test(to) ? to : toIsoDateString(today);

  if (!start || !end) {
    const nowIso = toIsoDateString(new Date()) ?? "1970-01-01";
    return { startDate: nowIso, endDate: nowIso };
  }

  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  return { startDate: start, endDate: end };
}

async function syncAbsentAttendanceForRange(authContext, employeeId, startDate, endDate) {
  return withRlsContext(authContext, async (client) => {
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
        )
      ON CONFLICT (employee_id, attendance_date) DO NOTHING
      `,
      [employeeId, startDate, endDate, attendanceTimeZone],
    );

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
      UPDATE app.attendance_records ar
      SET
        status = CASE
          WHEN dd.has_in_hours_logs = FALSE THEN 'absent'::app.attendance_status
          WHEN COALESCE(ar.late_minutes, 0) >= 15 THEN 'late'::app.attendance_status
          ELSE 'present'::app.attendance_status
        END,
        clock_in = CASE WHEN dd.has_in_hours_logs = FALSE THEN NULL ELSE ar.clock_in END,
        clock_out = CASE WHEN dd.has_in_hours_logs = FALSE THEN NULL ELSE ar.clock_out END,
        work_duration_minutes = CASE
          WHEN dd.has_in_hours_logs = FALSE THEN 0
          ELSE ar.work_duration_minutes
        END,
        late_minutes = CASE WHEN dd.has_in_hours_logs = FALSE THEN 0 ELSE ar.late_minutes END,
        total_break_duration_minutes = CASE
          WHEN dd.has_in_hours_logs = FALSE THEN 0
          ELSE ar.total_break_duration_minutes
        END,
        active_break_started_at = CASE
          WHEN dd.has_in_hours_logs = FALSE THEN NULL
          ELSE ar.active_break_started_at
        END
      FROM due_days dd
      WHERE ar.employee_id = $1::text
        AND ar.attendance_date = dd.day_date
        AND ar.status IN ('present'::app.attendance_status, 'late'::app.attendance_status, 'absent'::app.attendance_status)
      `,
      [employeeId, startDate, endDate, attendanceTimeZone],
    );
  });
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
        ELSE e.attendance_status
      END AS attendance_status,
      e.employment_status,
      e.employment_type,
      ta.clock_in,
      ta.clock_out,
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
        ar.clock_in,
        ar.clock_out,
        ar.active_break_started_at
      FROM app.attendance_records ar
      WHERE ar.employee_id = e.employee_id
        AND ar.attendance_date = (NOW() AT TIME ZONE $2::text)::date
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
    [employeeId, attendanceTimeZone],
  );

  return result.rows[0] ?? null;
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
    [requestId],
  );

  return result.rows[0] ?? null;
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
    [employeeIdentifier],
  );

  return result.rows[0]?.employee_id ?? null;
}

async function isEmailTakenByAnotherEmployee(client, email, employeeId = null) {
  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  if (!normalizedEmail) {
    return false;
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
      [normalizedEmail, employeeId],
    )
    : await client.query(
      `
      SELECT 1
      FROM app.employees
      WHERE email = $1::citext
      LIMIT 1
      `,
      [normalizedEmail],
    );

  return result.rowCount > 0;
}

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    const result = await query(
      `SELECT * FROM app_auth.login_user($1::citext, $2::text, $3::inet, $4::text)`,
      [email, password, null, req.headers["user-agent"] ?? "api-client"],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const row = result.rows[0];
    const profile = await getUserProfileByUserId(row.user_id);

    const accessToken = signAccessToken({
      userId: row.user_id,
      role: row.role_name,
      sessionId: row.session_id,
      employeeId: profile?.employee_id ?? null,
    });

    return res.json({
      accessToken,
      refreshToken: row.refresh_token,
      sessionId: row.session_id,
      role: row.role_name,
      user: {
        userId: row.user_id,
        employeeId: profile?.employee_id ?? null,
        email: profile?.email ?? email,
        fullName: profile?.first_name
          ? `${profile.first_name} ${profile.last_name}`
          : null,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

app.post("/auth/biometric-login", async (req, res) => {
  const parsed = biometricLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email } = parsed.data;

  try {
    const userResult = email
      ? await query(
          `
          SELECT
            u.user_id,
            u.email,
            u.employee_id,
            u.is_active,
            COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) AS biometric_login,
            r.role_name
          FROM app_auth.users u
          LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
          LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.user_id
          LEFT JOIN app_auth.roles r ON r.role_id = ur.role_id
          WHERE u.email = $1::citext
          ORDER BY r.role_name DESC NULLS LAST
          LIMIT 1
          `,
          [email],
        )
      : await query(
          `
          SELECT
            u.user_id,
            u.email,
            u.employee_id,
            u.is_active,
            COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) AS biometric_login,
            r.role_name
          FROM app_auth.users u
          LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
          LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.user_id
          LEFT JOIN app_auth.roles r ON r.role_id = ur.role_id
          WHERE u.is_active = TRUE
            AND COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) = TRUE
          ORDER BY u.last_login_at DESC NULLS LAST, u.created_at DESC
          LIMIT 1
          `,
        );

    const userRow = userResult.rows[0] ?? null;
    if (!userRow || !userRow.is_active) {
      return res.status(401).json({ error: "User does not exist or is inactive" });
    }

    if (!userRow.biometric_login) {
      return res.status(403).json({ error: "Biometric login is disabled for this user" });
    }

    const roleName = userRow.role_name ?? "employee";
    const refreshToken = randomBytes(48).toString("base64url");

    const sessionResult = await query(
      `
      INSERT INTO app_auth.sessions (
        user_id,
        refresh_token_hash,
        ip_address,
        user_agent,
        expires_at
      )
      VALUES (
        $1::uuid,
        crypt($2::text, gen_salt('bf', 8)),
        $3::inet,
        $4::text,
        NOW() + INTERVAL '30 days'
      )
      RETURNING session_id
      `,
      [
        userRow.user_id,
        refreshToken,
        null,
        req.headers["user-agent"] ?? "biometric-client",
      ],
    );

    await query(
      `
      UPDATE app_auth.users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE user_id = $1::uuid
      `,
      [userRow.user_id],
    );

    const profile = await getUserProfileByUserId(userRow.user_id);
    const accessToken = signAccessToken({
      userId: userRow.user_id,
      role: roleName,
      sessionId: sessionResult.rows[0].session_id,
      employeeId: profile?.employee_id ?? userRow.employee_id ?? null,
    });

    return res.json({
      accessToken,
      refreshToken,
      sessionId: sessionResult.rows[0].session_id,
      role: roleName,
      user: {
        userId: userRow.user_id,
        employeeId: profile?.employee_id ?? userRow.employee_id ?? null,
        email: profile?.email ?? userRow.email,
        fullName: profile?.first_name
          ? `${profile.first_name} ${profile.last_name}`
          : null,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

app.get("/auth/biometric-login/available", async (_req, res) => {
  try {
    const result = await query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM app_auth.users u
        LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
        WHERE u.is_active = TRUE
          AND COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) = TRUE
      ) AS available
      `,
    );

    return res.json({
      available: Boolean(result.rows[0]?.available),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/auth/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { sessionId, refreshToken } = parsed.data;

  try {
    const result = await query(
      `SELECT * FROM app_auth.refresh_session($1::uuid, $2::text, $3::inet, $4::text)`,
      [sessionId, refreshToken, null, req.headers["user-agent"] ?? "api-client"],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid refresh session" });
    }

    const row = result.rows[0];
    const profile = await getUserProfileByUserId(row.user_id);

    const accessToken = signAccessToken({
      userId: row.user_id,
      role: row.role_name,
      sessionId: row.session_id,
      employeeId: row.employee_id ?? profile?.employee_id ?? null,
    });

    return res.json({
      accessToken,
      refreshToken: row.refresh_token,
      sessionId: row.session_id,
      role: row.role_name,
      user: {
        userId: row.user_id,
        employeeId: row.employee_id ?? profile?.employee_id ?? null,
        email: profile?.email ?? null,
        fullName: profile?.first_name
          ? `${profile.first_name} ${profile.last_name}`
          : null,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  employeeId: z.string().min(1),
  role: z.enum(["employee", "hr_manager", "admin"]).default("employee"),
});

app.post(
  "/auth/register",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password, employeeId, role } = parsed.data;

    try {
      const result = await query(
        `SELECT app_auth.register_user($1::citext, $2::text, $3::text, $4::text) AS user_id`,
        [email, password, employeeId, role],
      );
      return res.status(201).json({ userId: result.rows[0].user_id });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    await query("SELECT app_auth.revoke_session($1::uuid)", [req.auth.sessionId]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/profile", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error:
          "No employee profile is linked to this account yet. Please contact HR/Admin.",
      });
    }

    const result = await query(
      `
      SELECT
        e.employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.email,
        e.department_id,
        d.name AS department,
        e.position_id,
        COALESCE(jp.name, e.position) AS position,
        e.attendance_status,
        e.employment_status,
        e.employment_type,
        e.phone,
        e.join_date,
        e.birthday,
        e.gender,
        e.nationality,
        e.marital_status,
        e.address,
        e.profile_picture_url,
        pp.sss,
        pp.tin,
        pp.phil_health,
        pp.pag_ibig
      FROM app.employees e
      LEFT JOIN app.departments d ON d.department_id = e.department_id
      LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
      LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
      WHERE e.employee_id = $1::text
      `,
      [resolvedEmployeeId],
    );

    return res.json({ profile: result.rows[0] ?? null });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.patch("/me/profile", requireAuth, async (req, res) => {
  const parsed = selfProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
  if (!resolvedEmployeeId) {
    return res.status(404).json({
      error:
        "No employee profile is linked to this account yet. Please contact HR/Admin.",
    });
  }

  const employeeAssignments = [];
  const employeeParams = [];
  const payrollAssignments = [];
  const payrollParams = [];

  const employeeFieldMap = {
    email: "email",
    phone: "phone",
    birthday: "birthday",
    gender: "gender",
    nationality: "nationality",
    maritalStatus: "marital_status",
    address: "address",
    departmentId: "department_id",
    employmentType: "employment_type",
    position: "position",
    positionId: "position_id",
    joinDate: "join_date",
    profilePictureUrl: "profile_picture_url",
  };

  const payrollFieldMap = {
    sssNumber: "sss",
    tinNumber: "tin",
    philhealthNumber: "phil_health",
    pagibigNumber: "pag_ibig",
  };

  for (const [jsonKey, dbColumn] of Object.entries(employeeFieldMap)) {
    if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
      employeeParams.push(payload[jsonKey]);
      employeeAssignments.push(`${dbColumn} = $${employeeParams.length}`);
    }
  }

  for (const [jsonKey, dbColumn] of Object.entries(payrollFieldMap)) {
    if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
      payrollParams.push(payload[jsonKey]);
      payrollAssignments.push(`${dbColumn} = $${payrollParams.length}`);
    }
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [
        String(req.auth.userId),
      ]);
      await client.query("SELECT set_config('app.user_role', $1, true)", [
        String(req.auth.role),
      ]);

      if (employeeAssignments.length > 0) {
        const employeeUpdateParams = [...employeeParams, resolvedEmployeeId];
        await client.query(
          `
          UPDATE app.employees
          SET ${employeeAssignments.join(", ")}, updated_at = NOW()
          WHERE employee_id = $${employeeUpdateParams.length}::text
          `,
          employeeUpdateParams,
        );

        if (Object.prototype.hasOwnProperty.call(payload, "positionId")) {
          await client.query(
            `
            UPDATE app.employees e
            SET position = jp.name
            FROM app.job_positions jp
            WHERE e.employee_id = $1::text
              AND jp.position_id = e.position_id
            `,
            [resolvedEmployeeId],
          );

          if (payload.positionId === null) {
            await client.query(
              `
              UPDATE app.employees
              SET position = NULL
              WHERE employee_id = $1::text
              `,
              [resolvedEmployeeId],
            );
          }
        }
      }

      if (payrollAssignments.length > 0) {
        await client.query(
          `
          INSERT INTO app.payroll_profiles (employee_id, salary)
          VALUES ($1::text, 0)
          ON CONFLICT (employee_id) DO NOTHING
          `,
          [resolvedEmployeeId],
        );

        const payrollUpdateParams = [...payrollParams, resolvedEmployeeId];
        await client.query(
          `
          UPDATE app.payroll_profiles
          SET ${payrollAssignments.join(", ")}, updated_at = NOW()
          WHERE employee_id = $${payrollUpdateParams.length}::text
          `,
          payrollUpdateParams,
        );
      }

      const result = await client.query(
        `
        SELECT
          e.employee_id,
          e.employee_code,
          e.first_name,
          e.last_name,
          e.email,
          e.department_id,
          d.name AS department,
          e.position_id,
          COALESCE(jp.name, e.position) AS position,
          e.attendance_status,
          e.employment_status,
          e.employment_type,
          e.phone,
          e.join_date,
          e.birthday,
          e.gender,
          e.nationality,
          e.marital_status,
          e.address,
          e.profile_picture_url,
          pp.sss,
          pp.tin,
          pp.phil_health,
          pp.pag_ibig
        FROM app.employees e
        LEFT JOIN app.departments d ON d.department_id = e.department_id
        LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
        LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
        WHERE e.employee_id = $1::text
        `,
        [resolvedEmployeeId],
      );

      await client.query("COMMIT");
      return res.json({ profile: result.rows[0] ?? null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/security-preferences", requireAuth, async (req, res) => {
  try {
    await query(
      `
      INSERT INTO app_auth.user_security_preferences (user_id)
      VALUES ($1::uuid)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [req.auth.userId],
    );

    const preferenceResult = await query(
      `
      SELECT
        sp.biometric_login,
        sp.biometric_clock_in_out,
        sp.password_waived,
        u.dark_mode_enabled,
        sp.created_at,
        sp.updated_at
      FROM app_auth.user_security_preferences sp
      JOIN app_auth.users u ON u.user_id = sp.user_id
      WHERE sp.user_id = $1::uuid
      `,
      [req.auth.userId],
    );

    const activityResult = await query(
      `
      SELECT
        activity_id,
        action,
        activity_at,
        platform,
        status,
        is_waived,
        details,
        ip_address,
        user_agent
      FROM app_auth.password_activities
      WHERE user_id = $1::uuid
      ORDER BY activity_at DESC
      LIMIT 20
      `,
      [req.auth.userId],
    );

    const preferenceRow = preferenceResult.rows[0] ?? {
      biometric_login: false,
      biometric_clock_in_out: false,
      password_waived: false,
      dark_mode_enabled: false,
      created_at: null,
      updated_at: null,
    };

    return res.json({
      preferences: mapSecurityPreferenceRow(preferenceRow),
      passwordActivities: activityResult.rows.map(mapPasswordActivityRow),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/security-preferences/password-activities", requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
    : 20;

  try {
    const activityResult = await query(
      `
      SELECT
        activity_id,
        action,
        activity_at,
        platform,
        status,
        is_waived,
        details,
        ip_address,
        user_agent
      FROM app_auth.password_activities
      WHERE user_id = $1::uuid
      ORDER BY activity_at DESC
      LIMIT $2::int
      `,
      [req.auth.userId, limit],
    );

    return res.json({
      passwordActivities: activityResult.rows.map(mapPasswordActivityRow),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/security-preferences", requireAuth, async (req, res) => {
  const parsed = securityPreferenceCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  try {
    const result = await query(
      `
      INSERT INTO app_auth.user_security_preferences (
        user_id,
        biometric_login,
        biometric_clock_in_out,
        password_waived
      )
      VALUES ($1::uuid, $2::boolean, $3::boolean, $4::boolean)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING biometric_login, biometric_clock_in_out, password_waived, created_at, updated_at
      `,
      [
        req.auth.userId,
        payload.biometricLogin,
        payload.biometricClockInOut,
        payload.passwordWaived,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({ error: "Security preferences already exist for this user" });
    }

    if (Object.prototype.hasOwnProperty.call(payload, "darkModeEnabled")) {
      await query(
        `
        UPDATE app_auth.users
        SET dark_mode_enabled = $1::boolean, updated_at = NOW()
        WHERE user_id = $2::uuid
        `,
        [payload.darkModeEnabled, req.auth.userId],
      );
    }

    const mergedResult = await query(
      `
      SELECT
        sp.biometric_login,
        sp.biometric_clock_in_out,
        sp.password_waived,
        u.dark_mode_enabled,
        sp.created_at,
        sp.updated_at
      FROM app_auth.user_security_preferences sp
      JOIN app_auth.users u ON u.user_id = sp.user_id
      WHERE sp.user_id = $1::uuid
      `,
      [req.auth.userId],
    );

    return res.status(201).json({ preferences: mapSecurityPreferenceRow(mergedResult.rows[0]) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put("/me/security-preferences", requireAuth, async (req, res) => {
  const parsed = securityPreferenceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;

  try {
    await query(
      `
      INSERT INTO app_auth.user_security_preferences (
        user_id,
        biometric_login,
        biometric_clock_in_out,
        password_waived
      )
      VALUES (
        $1::uuid,
        COALESCE($2::boolean, FALSE),
        COALESCE($3::boolean, FALSE),
        COALESCE($4::boolean, FALSE)
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        biometric_login = COALESCE($2::boolean, app_auth.user_security_preferences.biometric_login),
        biometric_clock_in_out = COALESCE($3::boolean, app_auth.user_security_preferences.biometric_clock_in_out),
        password_waived = COALESCE($4::boolean, app_auth.user_security_preferences.password_waived),
        updated_at = NOW()
      RETURNING biometric_login, biometric_clock_in_out, password_waived, created_at, updated_at
      `,
      [
        req.auth.userId,
        Object.prototype.hasOwnProperty.call(payload, "biometricLogin")
          ? payload.biometricLogin
          : null,
        Object.prototype.hasOwnProperty.call(payload, "biometricClockInOut")
          ? payload.biometricClockInOut
          : null,
        Object.prototype.hasOwnProperty.call(payload, "passwordWaived")
          ? payload.passwordWaived
          : null,
      ],
    );

    if (Object.prototype.hasOwnProperty.call(payload, "darkModeEnabled")) {
      await query(
        `
        UPDATE app_auth.users
        SET dark_mode_enabled = $1::boolean, updated_at = NOW()
        WHERE user_id = $2::uuid
        `,
        [payload.darkModeEnabled, req.auth.userId],
      );
    }

    const mergedResult = await query(
      `
      SELECT
        sp.biometric_login,
        sp.biometric_clock_in_out,
        sp.password_waived,
        u.dark_mode_enabled,
        sp.created_at,
        sp.updated_at
      FROM app_auth.user_security_preferences sp
      JOIN app_auth.users u ON u.user_id = sp.user_id
      WHERE sp.user_id = $1::uuid
      `,
      [req.auth.userId],
    );

    return res.json({ preferences: mapSecurityPreferenceRow(mergedResult.rows[0]) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete("/me/security-preferences", requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
      DELETE FROM app_auth.user_security_preferences
      WHERE user_id = $1::uuid
      RETURNING user_id
      `,
      [req.auth.userId],
    );

    return res.json({
      deleted: result.rowCount > 0,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/security-preferences/password", requireAuth, async (req, res) => {
  const parsed = updatePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const passwordValidationError = getPasswordValidationError(payload.newPassword);
  if (passwordValidationError) {
    return res.status(400).json({ error: passwordValidationError });
  }

  const platform = payload.platform ?? String(req.headers["user-agent"] ?? "api-client").slice(0, 120);
  const status = payload.status ?? "Successful";
  const action = payload.waivePassword ? "Waive Password" : "Update Password";
  const userAgent = String(req.headers["user-agent"] ?? "api-client");
  const ipAddress = req.ip ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE app_auth.users
      SET password_hash = crypt($1::text, gen_salt('bf', 10)), updated_at = NOW()
      WHERE user_id = $2::uuid
      `,
      [payload.newPassword, req.auth.userId],
    );

    await client.query(
      `
      INSERT INTO app_auth.user_security_preferences (user_id, password_waived)
      VALUES ($1::uuid, $2::boolean)
      ON CONFLICT (user_id) DO UPDATE
      SET password_waived = EXCLUDED.password_waived, updated_at = NOW()
      `,
      [req.auth.userId, payload.waivePassword],
    );

    const activityResult = await client.query(
      `
      INSERT INTO app_auth.password_activities (
        user_id,
        action,
        activity_at,
        platform,
        status,
        is_waived,
        details,
        ip_address,
        user_agent
      )
      VALUES (
        $1::uuid,
        $2::text,
        NOW(),
        $3::text,
        $4::text,
        $5::boolean,
        $6::jsonb,
        $7::inet,
        $8::text
      )
      RETURNING
        activity_id,
        action,
        activity_at,
        platform,
        status,
        is_waived,
        details,
        ip_address,
        user_agent
      `,
      [
        req.auth.userId,
        action,
        platform,
        status,
        payload.waivePassword,
        payload.details ? JSON.stringify(payload.details) : null,
        ipAddress,
        userAgent,
      ],
    );

    await client.query("COMMIT");
    return res.json({
      ok: true,
      activity: mapPasswordActivityRow(activityResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/meta/employment-options", requireAuth, async (_req, res) => {
  try {
    const employmentTypesResult = await query(
      `
      SELECT unnest(enum_range(NULL::app.employment_type))::text AS value
      `,
    );

    const departmentsResult = await query(
      `
      SELECT department_id, name
      FROM app.departments
      WHERE name IN (
        'Software Engineering',
        'Quality Assurance',
        'DevOps & Infrastructure',
        'Data Engineering',
        'IT Support'
      )
      ORDER BY name
      `,
    );

    const positionsResult = await query(
      `
      SELECT position_id, department_id, name
      FROM app.job_positions
      ORDER BY name
      `,
    );

    return res.json({
      employmentTypes: employmentTypesResult.rows.map((row) => row.value),
      departments: departmentsResult.rows,
      positions: positionsResult.rows,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/attendance", requireAuth, async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;

  const where = [];
  const params = [];

  if (typeof from === "string") {
    params.push(from);
    where.push(`attendance_date >= $${params.length}::date`);
  }
  if (typeof to === "string") {
    params.push(to);
    where.push(`attendance_date <= $${params.length}::date`);
  }

  const filterSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const { startDate, endDate } = buildAttendanceSyncRange(
      typeof from === "string" ? from : null,
      typeof to === "string" ? to : null,
    );
    await syncAbsentAttendanceForRange(req.auth, resolvedEmployeeId, startDate, endDate);

    const rows = await withRlsContext(req.auth, async (client) => {
      const result = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        ${filterSql}
        ORDER BY attendance_date DESC
        LIMIT 90
        `,
        params,
      );
      return result.rows;
    });

    return res.json({ attendance: rows.map(mapAttendanceRecordRow) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/attendance/today", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const payload = await withRlsContext(req.auth, async (client) => {
      const nowResult = await client.query(
        `
        SELECT
          NOW() AS now_at,
          (NOW() AT TIME ZONE $1::text) AS now_local
        `,
        [attendanceTimeZone],
      );
      const nowAt = nowResult.rows[0].now_at;
      const nowLocal = nowResult.rows[0].now_local;

      const result = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        WHERE employee_id = $1::text
          AND attendance_date = (NOW() AT TIME ZONE $2::text)::date
        LIMIT 1
        `,
        [resolvedEmployeeId, attendanceTimeZone],
      );

      const attendance = result.rows[0] ?? null;
      if (!attendance) {
        return {
          attendance: null,
          currentWorkDurationMinutes: 0,
          logs: [],
        };
      }

      let currentWorkDurationMinutes = Number(attendance.work_duration_minutes ?? 0);
      if (attendance.clock_in && !attendance.clock_out) {
        const sessionNetMinutes = await computeActiveSessionNetMinutes(client, {
          nowLocal,
          nowAt,
          attendanceDate: attendance.attendance_date,
          clockIn: attendance.clock_in,
          attendanceId: attendance.attendance_id,
          attendanceTimeZoneValue: attendanceTimeZone,
        });
        currentWorkDurationMinutes += sessionNetMinutes;
      }

      const logsResult = await client.query(
        `
        SELECT activity_id, action, logged_at, metadata
        FROM app.attendance_activity_logs
        WHERE attendance_id = $1::bigint
        ORDER BY logged_at DESC
        LIMIT 50
        `,
        [attendance.attendance_id],
      );

      return {
        attendance,
        currentWorkDurationMinutes,
        logs: logsResult.rows.map(mapAttendanceActivityLogRow),
      };
    });

    return res.json({
      attendance: payload.attendance ? mapAttendanceRecordRow(payload.attendance) : null,
      currentWorkDurationMinutes: payload.currentWorkDurationMinutes,
      logs: payload.logs,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance/clock-in", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const attendance = await withRlsContext(req.auth, async (client) => {
      const nowResult = await client.query(
        `
        SELECT
          NOW() AS now_at,
          (NOW() AT TIME ZONE $1::text) AS now_local,
          (NOW() AT TIME ZONE $1::text)::time AS now_time,
          (NOW() AT TIME ZONE $1::text)::date AS today_date
        `,
        [attendanceTimeZone],
      );
      const nowAt = nowResult.rows[0].now_at;
      const nowTime = nowResult.rows[0].now_time;
      const todayDate = nowResult.rows[0].today_date;

      const existingResult = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        WHERE employee_id = $1::text
          AND attendance_date = $2::date
        LIMIT 1
        FOR UPDATE
        `,
        [resolvedEmployeeId, todayDate],
      );

      if (existingResult.rowCount === 0) {
        const lateComputationResult = await client.query(
          `
          WITH schedule AS (
            SELECT is_working_day, start_time
            FROM app.company_settings_working_hours
            WHERE iso_day = EXTRACT(ISODOW FROM $1::date)::smallint
            LIMIT 1
          )
          SELECT
            CASE
              WHEN COALESCE((SELECT is_working_day FROM schedule), false)
                AND (SELECT start_time FROM schedule) IS NOT NULL
                AND $2::time >= ((SELECT start_time FROM schedule) + INTERVAL '15 minutes')::time
              THEN GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM ($2::time - (SELECT start_time FROM schedule))) / 60)::integer
              )
              ELSE 0
            END AS late_minutes,
            CASE
              WHEN COALESCE((SELECT is_working_day FROM schedule), false)
                AND (SELECT start_time FROM schedule) IS NOT NULL
                AND $2::time >= ((SELECT start_time FROM schedule) + INTERVAL '15 minutes')::time
              THEN 'late'
              ELSE 'present'
            END AS attendance_status
          `,
          [todayDate, nowTime],
        );

        const lateMinutes = Number(lateComputationResult.rows[0]?.late_minutes ?? 0);
        const attendanceStatus = String(
          lateComputationResult.rows[0]?.attendance_status ?? "present",
        );

        const insertedResult = await client.query(
          `
          INSERT INTO app.attendance_records (
            employee_id,
            attendance_date,
            status,
            clock_in,
            clock_out,
            work_duration_minutes,
            late_minutes,
            total_break_duration_minutes,
            active_break_started_at
          )
          VALUES (
            $1::text,
            $2::date,
            $4::app.attendance_status,
            $3::time,
            NULL,
            0,
            $5::integer,
            0,
            NULL
          )
          RETURNING
            attendance_id,
            attendance_date,
            status,
            clock_in,
            clock_out,
            work_duration_minutes,
            late_minutes,
            total_break_duration_minutes,
            active_break_started_at
          `,
          [resolvedEmployeeId, todayDate, nowTime, attendanceStatus, lateMinutes],
        );

        await insertAttendanceActivityLog(client, {
          attendanceId: insertedResult.rows[0].attendance_id,
          employeeId: resolvedEmployeeId,
          action: "clock_in",
          metadata: {
            clockInTime: String(insertedResult.rows[0].clock_in ?? ""),
            source: "home",
          },
        });

        return insertedResult.rows[0];
      }

      const existing = existingResult.rows[0];
      if (existing.clock_in && !existing.clock_out) {
        throw new Error("You are already clocked in for today.");
      }

      const updatedResult = await client.query(
        `
        UPDATE app.attendance_records
        SET
          status = CASE
            WHEN COALESCE(late_minutes, 0) >= 15 THEN 'late'::app.attendance_status
            ELSE 'present'::app.attendance_status
          END,
          clock_in = $1::time,
          clock_out = NULL,
          active_break_started_at = NULL
        WHERE attendance_id = $2::bigint
        RETURNING
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        `,
        [nowTime, existing.attendance_id],
      );

      await insertAttendanceActivityLog(client, {
        attendanceId: existing.attendance_id,
        employeeId: resolvedEmployeeId,
        action: "clock_in",
        metadata: {
          clockInTime: String(updatedResult.rows[0].clock_in ?? ""),
          source: "home",
        },
      });

      return updatedResult.rows[0];
    });

    return res.status(201).json({ attendance: mapAttendanceRecordRow(attendance) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance/break/start", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const responsePayload = await withRlsContext(req.auth, async (client) => {
      const nowResult = await client.query(
        `
        SELECT
          NOW() AS now_at,
          (NOW() AT TIME ZONE $1::text)::date AS today_date
        `,
        [attendanceTimeZone],
      );
      const nowAt = nowResult.rows[0].now_at;
      const todayDate = nowResult.rows[0].today_date;

      const attendanceResult = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        WHERE employee_id = $1::text
          AND attendance_date = $2::date
        LIMIT 1
        FOR UPDATE
        `,
        [resolvedEmployeeId, todayDate],
      );

      if (attendanceResult.rowCount === 0) {
        throw new Error("No attendance record found for today. Please clock in first.");
      }

      const attendance = attendanceResult.rows[0];

      if (!attendance.clock_in || attendance.clock_out) {
        throw new Error("Break can only be started while clocked in.");
      }

      if (attendance.active_break_started_at) {
        throw new Error("A break is already in progress.");
      }

      const openBreakResult = await client.query(
        `
        SELECT break_id
        FROM app.attendance_break_logs
        WHERE attendance_id = $1::bigint
          AND break_ended_at IS NULL
        LIMIT 1
        FOR UPDATE
        `,
        [attendance.attendance_id],
      );

      if (openBreakResult.rowCount > 0) {
        throw new Error("A break is already in progress.");
      }

      const breakResult = await client.query(
        `
        INSERT INTO app.attendance_break_logs (
          attendance_id,
          break_started_at,
          break_ended_at,
          break_duration_minutes
        )
        VALUES ($1::bigint, $2::timestamptz, NULL, NULL)
        RETURNING break_id, break_started_at
        `,
        [attendance.attendance_id, nowAt],
      );

      const updatedAttendanceResult = await client.query(
        `
        UPDATE app.attendance_records
        SET active_break_started_at = $1::timestamptz
        WHERE attendance_id = $2::bigint
        RETURNING
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        `,
        [nowAt, attendance.attendance_id],
      );

      await insertAttendanceActivityLog(client, {
        attendanceId: attendance.attendance_id,
        employeeId: resolvedEmployeeId,
        action: "break_start",
        metadata: {
          breakId: Number(breakResult.rows[0].break_id),
          source: "home",
        },
      });

      return {
        attendance: updatedAttendanceResult.rows[0],
        breakLog: breakResult.rows[0],
      };
    });

    return res.status(201).json({
      attendance: mapAttendanceRecordRow(responsePayload.attendance),
      breakLog: {
        breakId: Number(responsePayload.breakLog.break_id),
        breakStartedAt: responsePayload.breakLog.break_started_at,
      },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance/break/end", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const responsePayload = await withRlsContext(req.auth, async (client) => {
      const nowResult = await client.query(
        `
        SELECT
          NOW() AS now_at,
          (NOW() AT TIME ZONE $1::text)::date AS today_date
        `,
        [attendanceTimeZone],
      );
      const nowAt = nowResult.rows[0].now_at;
      const todayDate = nowResult.rows[0].today_date;

      const attendanceResult = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        WHERE employee_id = $1::text
          AND attendance_date = $2::date
        LIMIT 1
        FOR UPDATE
        `,
        [resolvedEmployeeId, todayDate],
      );

      if (attendanceResult.rowCount === 0) {
        throw new Error("No attendance record found for today.");
      }

      const attendance = attendanceResult.rows[0];

      if (!attendance.clock_in || attendance.clock_out) {
        throw new Error("No active shift found to end a break.");
      }

      if (!attendance.active_break_started_at) {
        throw new Error("No active break found.");
      }

      const openBreakResult = await client.query(
        `
        SELECT break_id, break_started_at
        FROM app.attendance_break_logs
        WHERE attendance_id = $1::bigint
          AND break_ended_at IS NULL
        ORDER BY break_started_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [attendance.attendance_id],
      );

      if (openBreakResult.rowCount === 0) {
        throw new Error("No active break found.");
      }

      const openBreak = openBreakResult.rows[0];
      const startedAtMs = new Date(openBreak.break_started_at).getTime();
      const endedAtMs = new Date(nowAt).getTime();
      const durationMinutes = Math.max(0, Math.floor((endedAtMs - startedAtMs) / (1000 * 60)));

      await client.query(
        `
        UPDATE app.attendance_break_logs
        SET
          break_ended_at = $1::timestamptz,
          break_duration_minutes = $2::integer
        WHERE break_id = $3::bigint
        `,
        [nowAt, durationMinutes, openBreak.break_id],
      );

      const updatedAttendanceResult = await client.query(
        `
        UPDATE app.attendance_records
        SET
          total_break_duration_minutes = COALESCE(total_break_duration_minutes, 0) + $1::integer,
          active_break_started_at = NULL
        WHERE attendance_id = $2::bigint
        RETURNING
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        `,
        [durationMinutes, attendance.attendance_id],
      );

      await insertAttendanceActivityLog(client, {
        attendanceId: attendance.attendance_id,
        employeeId: resolvedEmployeeId,
        action: "break_end",
        metadata: {
          breakId: Number(openBreak.break_id),
          breakDurationMinutes: durationMinutes,
          source: "home",
        },
      });

      return {
        attendance: updatedAttendanceResult.rows[0],
        breakLog: {
          breakId: Number(openBreak.break_id),
          breakStartedAt: openBreak.break_started_at,
          breakEndedAt: nowAt,
          breakDurationMinutes: durationMinutes,
        },
      };
    });

    return res.json({
      attendance: mapAttendanceRecordRow(responsePayload.attendance),
      breakLog: responsePayload.breakLog,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance/clock-out", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const attendance = await withRlsContext(req.auth, async (client) => {
      const nowResult = await client.query(
        `
        SELECT
          NOW() AS now_at,
          (NOW() AT TIME ZONE $1::text) AS now_local,
          (NOW() AT TIME ZONE $1::text)::time AS now_time,
          (NOW() AT TIME ZONE $1::text)::date AS today_date
        `,
        [attendanceTimeZone],
      );
      const nowAt = nowResult.rows[0].now_at;
      const nowLocal = nowResult.rows[0].now_local;
      const nowTime = nowResult.rows[0].now_time;
      const todayDate = nowResult.rows[0].today_date;

      const attendanceResult = await client.query(
        `
        SELECT
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        FROM app.attendance_records
        WHERE employee_id = $1::text
          AND attendance_date = $2::date
        LIMIT 1
        FOR UPDATE
        `,
        [resolvedEmployeeId, todayDate],
      );

      if (attendanceResult.rowCount === 0) {
        throw new Error("No attendance record found for today. Please clock in first.");
      }

      const attendance = attendanceResult.rows[0];
      if (!attendance.clock_in) {
        throw new Error("You are not clocked in yet.");
      }
      if (attendance.clock_out) {
        throw new Error("You are already clocked out for today.");
      }
      if (attendance.active_break_started_at) {
        throw new Error("Please end your break before clocking out.");
      }

      const sessionNetMinutes = await computeActiveSessionNetMinutes(client, {
        nowLocal,
        nowAt,
        attendanceDate: attendance.attendance_date,
        clockIn: attendance.clock_in,
        attendanceId: attendance.attendance_id,
        attendanceTimeZoneValue: attendanceTimeZone,
      });
      const computedDurationMinutes =
        Number(attendance.work_duration_minutes ?? 0) + Number(sessionNetMinutes);

      const updatedResult = await client.query(
        `
        UPDATE app.attendance_records
        SET
          clock_out = $1::time,
          work_duration_minutes = $2::integer,
          status = CASE
            WHEN COALESCE(late_minutes, 0) >= 15 THEN 'late'::app.attendance_status
            ELSE 'present'::app.attendance_status
          END
        WHERE attendance_id = $3::bigint
        RETURNING
          attendance_id,
          attendance_date,
          status,
          clock_in,
          clock_out,
          work_duration_minutes,
          late_minutes,
          total_break_duration_minutes,
          active_break_started_at
        `,
        [nowTime, computedDurationMinutes, attendance.attendance_id],
      );

      await insertAttendanceActivityLog(client, {
        attendanceId: attendance.attendance_id,
        employeeId: resolvedEmployeeId,
        action: "clock_out",
        metadata: {
          clockOutTime: String(updatedResult.rows[0].clock_out ?? ""),
          sessionNetMinutes,
          source: "home",
        },
      });

      return updatedResult.rows[0];
    });

    return res.json({ attendance: mapAttendanceRecordRow(attendance) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/attendance-adjustments", requireAuth, async (req, res) => {
  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const requestDate = typeof req.query.date === "string" ? req.query.date : null;
    if (requestDate && !isoDateRegex.test(requestDate)) {
      return res.status(400).json({ error: "Invalid date query. Use YYYY-MM-DD" });
    }

    const requests = await withRlsContext(req.auth, async (client) => {
      const params = [resolvedEmployeeId, "home"];
      let dateFilterSql = "";
      if (requestDate) {
        params.push(requestDate);
        dateFilterSql = `AND r.request_date = $${params.length}::date`;
      }

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
        WHERE r.employee_id = $1::text
          AND r.source_page = $2::text
          ${dateFilterSql}
        ORDER BY r.request_date DESC, r.submitted_at DESC
        LIMIT 300
        `,
        params,
      );

      return result.rows;
    });

    return res.json({
      requests: requests.map(mapAdjustmentRequestRow),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance-adjustments", requireAuth, async (req, res) => {
  const parsed = attendanceAdjustmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  if (payload.shiftDateFrom > payload.shiftDateTo) {
    return res.status(400).json({ error: "shiftDateFrom must be on or before shiftDateTo" });
  }

  if (payload.date !== payload.shiftDateFrom || payload.date !== payload.shiftDateTo) {
    return res.status(400).json({
      error: "For calendar adjustment requests, date, shiftDateFrom, and shiftDateTo must match.",
    });
  }

  const totalMinutes = computeTotalWorkDurationMinutes(
    payload.clockInTime,
    payload.clockOutTime,
    payload.breakDuration,
  );
  if (totalMinutes == null) {
    return res.status(400).json({
      error: "Invalid work duration. Ensure clockOutTime is later than clockInTime after break.",
    });
  }

  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const request = await withRlsContext(req.auth, async (client) => {
      const duplicateResult = await client.query(
        `
        SELECT request_id, status, submitted_at
        FROM app.attendance_adjustment_requests
        WHERE employee_id = $1::text
          AND request_date = $2::date
          AND source_page = 'home'
          AND status <> 'cancelled'::app.request_status
        LIMIT 1
        `,
        [resolvedEmployeeId, payload.date],
      );

      if (duplicateResult.rowCount > 0) {
        const existingRequest = duplicateResult.rows[0];

        if (existingRequest.status === "approved") {
          throw new Error(
            "An approved adjustment request already exists for this date. Revoke it first before submitting a new one.",
          );
        }

        const existingRequestId = existingRequest.request_id;

        await client.query(
          `
          UPDATE app.attendance_adjustment_requests
          SET
            shift_date_from = $1::date,
            shift_date_to = $2::date,
            clock_in_time = $3::text,
            clock_out_time = $4::text,
            reason = $5::app.adjustment_reason,
            break_duration_minutes = $6::integer,
            total_work_duration_minutes = $7::integer,
            message = $8::text,
            status = 'pending'::app.request_status,
            approved_by = NULL,
            approved_at = NULL,
            denied_reason = NULL
          WHERE request_id = $9::text
          `,
          [
            payload.shiftDateFrom,
            payload.shiftDateTo,
            payload.clockInTime,
            payload.clockOutTime,
            payload.reason,
            payload.breakDuration,
            totalMinutes,
            payload.message.trim(),
            existingRequestId,
          ],
        );

        await client.query(
          `
          DELETE FROM app.adjustment_request_attachments
          WHERE request_id = $1::text
          `,
          [existingRequestId],
        );

        const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        for (const fileName of attachments) {
          await client.query(
            `
            INSERT INTO app.adjustment_request_attachments (request_id, file_name)
            VALUES ($1::text, $2::text)
            `,
            [existingRequestId, fileName],
          );
        }

        await client.query(
          `
          DELETE FROM app.adjustment_request_logs
          WHERE request_id = $1::text
          `,
          [existingRequestId],
        );

        await client.query(
          `
          INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
          VALUES (
            $1::text,
            'pending'::app.request_status,
            COALESCE($2::timestamptz, NOW()),
            NULL,
            'Request submitted'
          )
          `,
          [existingRequestId, existingRequest.submitted_at],
        );

        return getAdjustmentRequestByIdForApi(client, existingRequestId);
      }

      const employeeResult = await client.query(
        `
        SELECT
          e.first_name,
          e.last_name,
          COALESCE(jp.name, e.position, 'Employee') AS position,
          COALESCE(d.name, 'N/A') AS department
        FROM app.employees e
        LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
        LEFT JOIN app.departments d ON d.department_id = e.department_id
        WHERE e.employee_id = $1::text
        LIMIT 1
        `,
        [resolvedEmployeeId],
      );

      const employeeRow = employeeResult.rows[0] ?? null;
      const employeeName = employeeRow
        ? `${employeeRow.first_name ?? ""} ${employeeRow.last_name ?? ""}`.trim() || "Employee"
        : "Employee";

      const requestId = `adj-home-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      await client.query(
        `
        INSERT INTO app.attendance_adjustment_requests (
          request_id,
          employee_id,
          employee_name,
          position,
          department,
          request_date,
          shift_date_from,
          shift_date_to,
          clock_in_time,
          clock_out_time,
          reason,
          break_duration_minutes,
          total_work_duration_minutes,
          message,
          status,
          submitted_at,
          source_page
        )
        VALUES (
          $1::text,
          $2::text,
          $3::text,
          $4::text,
          $5::text,
          $6::date,
          $7::date,
          $8::date,
          $9::text,
          $10::text,
          $11::app.adjustment_reason,
          $12::integer,
          $13::integer,
          $14::text,
          'pending'::app.request_status,
          NOW(),
          'home'
        )
        `,
        [
          requestId,
          resolvedEmployeeId,
          employeeName,
          employeeRow?.position ?? "Employee",
          employeeRow?.department ?? "N/A",
          payload.date,
          payload.shiftDateFrom,
          payload.shiftDateTo,
          payload.clockInTime,
          payload.clockOutTime,
          payload.reason,
          payload.breakDuration,
          totalMinutes,
          payload.message.trim(),
        ],
      );

      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      for (const fileName of attachments) {
        await client.query(
          `
          INSERT INTO app.adjustment_request_attachments (request_id, file_name)
          VALUES ($1::text, $2::text)
          `,
          [requestId, fileName],
        );
      }

      await client.query(
        `
        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
        VALUES ($1::text, 'pending'::app.request_status, NOW(), NULL, 'Request submitted')
        `,
        [requestId],
      );

      return getAdjustmentRequestByIdForApi(client, requestId);
    });

    return res.status(201).json({ request: mapAdjustmentRequestRow(request) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put("/me/attendance-adjustments/:requestId", requireAuth, async (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "Invalid requestId" });
  }

  const parsed = attendanceAdjustmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  if (payload.shiftDateFrom > payload.shiftDateTo) {
    return res.status(400).json({ error: "shiftDateFrom must be on or before shiftDateTo" });
  }

  if (payload.date !== payload.shiftDateFrom || payload.date !== payload.shiftDateTo) {
    return res.status(400).json({
      error: "For calendar adjustment requests, date, shiftDateFrom, and shiftDateTo must match.",
    });
  }

  const totalMinutes = computeTotalWorkDurationMinutes(
    payload.clockInTime,
    payload.clockOutTime,
    payload.breakDuration,
  );
  if (totalMinutes == null) {
    return res.status(400).json({
      error: "Invalid work duration. Ensure clockOutTime is later than clockInTime after break.",
    });
  }

  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const request = await withRlsContext(req.auth, async (client) => {
      const existingResult = await client.query(
        `
        SELECT request_id, status, submitted_at
        FROM app.attendance_adjustment_requests
        WHERE request_id = $1::text
          AND employee_id = $2::text
          AND source_page = 'home'
        LIMIT 1
        `,
        [requestId, resolvedEmployeeId],
      );

      if (existingResult.rowCount === 0) {
        throw new Error("Adjustment request not found");
      }

      const existing = existingResult.rows[0];
      if (existing.status === "approved") {
        throw new Error("Approved requests must be revoked before updating");
      }

      if (existing.status === "cancelled") {
        throw new Error("Cancelled requests cannot be updated");
      }

      await client.query(
        `
        UPDATE app.attendance_adjustment_requests
        SET
          request_date = $1::date,
          shift_date_from = $2::date,
          shift_date_to = $3::date,
          clock_in_time = $4::text,
          clock_out_time = $5::text,
          reason = $6::app.adjustment_reason,
          break_duration_minutes = $7::integer,
          total_work_duration_minutes = $8::integer,
          message = $9::text,
          status = 'pending'::app.request_status,
          approved_by = NULL,
          approved_at = NULL,
          denied_reason = NULL
        WHERE request_id = $10::text
        `,
        [
          payload.date,
          payload.shiftDateFrom,
          payload.shiftDateTo,
          payload.clockInTime,
          payload.clockOutTime,
          payload.reason,
          payload.breakDuration,
          totalMinutes,
          payload.message.trim(),
          requestId,
        ],
      );

      await client.query(
        `
        DELETE FROM app.adjustment_request_attachments
        WHERE request_id = $1::text
        `,
        [requestId],
      );

      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      for (const fileName of attachments) {
        await client.query(
          `
          INSERT INTO app.adjustment_request_attachments (request_id, file_name)
          VALUES ($1::text, $2::text)
          `,
          [requestId, fileName],
        );
      }

      await client.query(
        `
        DELETE FROM app.adjustment_request_logs
        WHERE request_id = $1::text
        `,
        [requestId],
      );

      await client.query(
        `
        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
        VALUES (
          $1::text,
          'pending'::app.request_status,
          COALESCE($2::timestamptz, NOW()),
          NULL,
          'Request updated by employee'
        )
        `,
        [requestId, existing.submitted_at],
      );

      return getAdjustmentRequestByIdForApi(client, requestId);
    });

    return res.json({ request: mapAdjustmentRequestRow(request) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete("/me/attendance-adjustments/:requestId", requireAuth, async (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "Invalid requestId" });
  }

  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    await withRlsContext(req.auth, async (client) => {
      const existingResult = await client.query(
        `
        SELECT request_id, status
        FROM app.attendance_adjustment_requests
        WHERE request_id = $1::text
          AND employee_id = $2::text
          AND source_page = 'home'
        LIMIT 1
        `,
        [requestId, resolvedEmployeeId],
      );

      if (existingResult.rowCount === 0) {
        throw new Error("Adjustment request not found");
      }

      const existing = existingResult.rows[0];
      if (existing.status === "approved") {
        throw new Error("Approved requests cannot be deleted. Revoke first.");
      }

      await client.query(
        `
        DELETE FROM app.attendance_adjustment_requests
        WHERE request_id = $1::text
        `,
        [requestId],
      );
    });

    return res.json({ deleted: true, requestId });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/me/attendance-adjustments/:requestId/revoke", requireAuth, async (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "Invalid requestId" });
  }

  try {
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const request = await withRlsContext(req.auth, async (client) => {
      const existingResult = await client.query(
        `
        SELECT request_id, status, submitted_at
        FROM app.attendance_adjustment_requests
        WHERE request_id = $1::text
          AND employee_id = $2::text
          AND source_page = 'home'
        LIMIT 1
        `,
        [requestId, resolvedEmployeeId],
      );

      if (existingResult.rowCount === 0) {
        throw new Error("Adjustment request not found");
      }

      const existing = existingResult.rows[0];
      if (existing.status !== "approved") {
        throw new Error("Only approved requests can be revoked");
      }

      await client.query(
        `
        UPDATE app.attendance_adjustment_requests
        SET
          status = 'pending'::app.request_status,
          approved_by = NULL,
          approved_at = NULL,
          denied_reason = NULL
        WHERE request_id = $1::text
        `,
        [requestId],
      );

      await client.query(
        `
        DELETE FROM app.adjustment_request_logs
        WHERE request_id = $1::text
        `,
        [requestId],
      );

      await client.query(
        `
        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
        VALUES (
          $1::text,
          'pending'::app.request_status,
          COALESCE($2::timestamptz, NOW()),
          NULL,
          'Request submitted'
        )
        `,
        [requestId, existing.submitted_at],
      );

      return getAdjustmentRequestByIdForApi(client, requestId);
    });

    return res.json({ request: mapAdjustmentRequestRow(request), revoked: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/calendar", requireAuth, async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;

  if (typeof from === "string" && !isoDateRegex.test(from)) {
    return res.status(400).json({ error: "Invalid from date. Use YYYY-MM-DD" });
  }
  if (typeof to === "string" && !isoDateRegex.test(to)) {
    return res.status(400).json({ error: "Invalid to date. Use YYYY-MM-DD" });
  }

  try {
    const seedResult = await seedCalendarSampleAttendanceIfEmpty(req.auth);
    const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId);
    if (!resolvedEmployeeId) {
      return res.status(404).json({
        error: "No employee profile is linked to this account yet.",
      });
    }

    const { startDate, endDate } = buildAttendanceSyncRange(
      typeof from === "string" ? from : null,
      typeof to === "string" ? to : null,
      365,
    );
    await syncAbsentAttendanceForRange(req.auth, resolvedEmployeeId, startDate, endDate);

    const attendanceWhere = [];
    const attendanceParams = [];

    if (typeof from === "string") {
      attendanceParams.push(from);
      attendanceWhere.push(`ar.attendance_date >= $${attendanceParams.length}::date`);
    }
    if (typeof to === "string") {
      attendanceParams.push(to);
      attendanceWhere.push(`ar.attendance_date <= $${attendanceParams.length}::date`);
    }

    const attendanceFilterSql = attendanceWhere.length
      ? `WHERE ${attendanceWhere.join(" AND ")}`
      : "";

    const holidaysWhere = [];
    const holidaysParams = [];
    if (typeof from === "string") {
      holidaysParams.push(from);
      holidaysWhere.push(`h.holiday_date >= $${holidaysParams.length}::date`);
    }
    if (typeof to === "string") {
      holidaysParams.push(to);
      holidaysWhere.push(`h.holiday_date <= $${holidaysParams.length}::date`);
    }

    const holidaysFilterSql = holidaysWhere.length
      ? `WHERE ${holidaysWhere.join(" AND ")}`
      : "";

    const { attendanceRows, holidayRows } = await withRlsContext(req.auth, async (client) => {
      const attendanceResult = await client.query(
        `
        SELECT
          ar.attendance_date::text AS attendance_date,
          ar.status,
          ar.clock_in,
          ar.clock_out,
          ar.work_duration_minutes,
          ar.late_minutes,
          h.name AS holiday_name,
          h.holiday_type
        FROM app.attendance_records ar
        LEFT JOIN LATERAL (
          SELECT
            string_agg(
              concat(h1.name, ' (', h1.country_code, ')'),
              ', '
              ORDER BY h1.country_code, h1.name
            ) AS name,
            CASE
              WHEN bool_or(h1.holiday_type = 'public'::app.holiday_type)
                THEN 'public'::app.holiday_type
              ELSE 'personal'::app.holiday_type
            END AS holiday_type
          FROM app.holidays h1
          WHERE h1.holiday_date = ar.attendance_date
        ) h ON TRUE
        ${attendanceFilterSql}
        ORDER BY ar.attendance_date DESC
        LIMIT 365
        `,
        attendanceParams,
      );

      const holidayResult = await client.query(
        `
        SELECT
          h.holiday_id,
          h.name,
          h.holiday_date::text AS holiday_date,
          h.holiday_type,
          h.country_code,
          h.country_name
        FROM app.holidays h
        ${holidaysFilterSql}
        ORDER BY h.holiday_date ASC, h.country_code ASC
        LIMIT 365
        `,
        holidaysParams,
      );

      return {
        attendanceRows: attendanceResult.rows,
        holidayRows: holidayResult.rows,
      };
    });

    const attendance = attendanceRows.map((row) => ({
      date: String(row.attendance_date).slice(0, 10),
      status: row.status,
      clockIn: row.clock_in ? String(row.clock_in).slice(0, 5) : null,
      clockOut: row.clock_out ? String(row.clock_out).slice(0, 5) : null,
      workDurationMinutes: row.work_duration_minutes,
      lateMinutes: row.late_minutes,
      holidayName: row.holiday_name ?? null,
      holidayType: row.holiday_type ?? null,
    }));

    const attendanceByDate = attendance.reduce((acc, row) => {
      acc[row.date] = row.status;
      return acc;
    }, {});

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const holidays = holidayRows.map((row) => {
      const holidayDate = new Date(`${String(row.holiday_date).slice(0, 10)}T00:00:00`);
      const daysUntil = Math.ceil((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: row.holiday_id,
        name: row.name,
        date: String(row.holiday_date).slice(0, 10),
        type: row.holiday_type,
        countryCode: row.country_code,
        countryName: row.country_name,
        daysUntil,
      };
    });

    const celebrations = await withRlsContext(req.auth, async (client) => {
      const celebrationRowsResult = await client.query(
        `
        SELECT employee_id, first_name, last_name, birthday
        FROM app.employees
        WHERE birthday IS NOT NULL
          AND employment_status = 'active'::app.employment_status
        ORDER BY first_name, last_name
        `,
      );

      const rows = celebrationRowsResult.rows;
      const now = new Date();
      const currentYear = now.getFullYear();
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const birthdayItems = rows
        .map((row) => {
          if (!row.birthday) {
            return null;
          }

          const rawBirthday = new Date(String(row.birthday));
          if (Number.isNaN(rawBirthday.getTime())) {
            return null;
          }

          let month = rawBirthday.getMonth();
          let day = rawBirthday.getDate();

          if (month === 1 && day === 29) {
            const isLeapYear =
              currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0);
            if (!isLeapYear) {
              day = 28;
            }
          }

          const celebrationDate = new Date(currentYear, month, day, 0, 0, 0, 0);
          if (celebrationDate < todayStart || celebrationDate > endOfYear) {
            return null;
          }

          const daysUntil = Math.ceil(
            (celebrationDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
          );

          return {
            id: `birthday-${row.employee_id}-${currentYear}`,
            type: "birthday",
            employeeId: row.employee_id,
            name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Employee",
            date: celebrationDate.toISOString().slice(0, 10),
            daysUntil,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 30);

      return birthdayItems;
    });

    return res.json({
      attendance,
      attendanceByDate,
      holidays,
      celebrations,
      seeded: seedResult.seeded,
      insertedRecords: seedResult.inserted,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get(
  "/settings/company-working-hours",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (_req, res) => {
    try {
      const result = await query(
        `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        ORDER BY iso_day ASC
        `,
      );

      return res.json({
        workingHours: result.rows.map(mapCompanyWorkingHourRow),
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.post(
  "/settings/company-working-hours",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = companyWorkingHourCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const normalizedInput = {
      day: payload.day,
      isWorkingDay: payload.isWorkingDay,
      startTime: payload.isWorkingDay ? payload.startTime ?? null : null,
      endTime: payload.isWorkingDay ? payload.endTime ?? null : null,
    };

    const validationError = buildScheduleValidationError(normalizedInput);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const result = await query(
        `
        INSERT INTO app.company_settings_working_hours (
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time
        )
        VALUES ($1::smallint, $2::text, $3::boolean, $4::time, $5::time)
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
        [
          isoDayByName[normalizedInput.day],
          normalizedInput.day,
          normalizedInput.isWorkingDay,
          normalizedInput.startTime,
          normalizedInput.endTime,
        ],
      );

      return res.status(201).json({
        workingHour: mapCompanyWorkingHourRow(result.rows[0]),
      });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Working-hour row for this day already exists" });
      }
      return res.status(400).json({ error: error.message });
    }
  },
);

app.put(
  "/settings/company-working-hours",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = companyWorkingHourBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const uniqueDays = new Set();
    const normalizedDays = [];

    for (const dayPayload of parsed.data.days) {
      if (uniqueDays.has(dayPayload.day)) {
        return res.status(400).json({ error: `Duplicate day: ${dayPayload.day}` });
      }

      uniqueDays.add(dayPayload.day);

      const normalized = {
        day: dayPayload.day,
        isWorkingDay: dayPayload.isWorkingDay,
        startTime: dayPayload.isWorkingDay ? dayPayload.startTime ?? null : null,
        endTime: dayPayload.isWorkingDay ? dayPayload.endTime ?? null : null,
      };

      const validationError = buildScheduleValidationError(normalized);
      if (validationError) {
        return res.status(400).json({ error: `${dayPayload.day}: ${validationError}` });
      }

      normalizedDays.push(normalized);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const day of normalizedDays) {
        await client.query(
          `
          INSERT INTO app.company_settings_working_hours (
            iso_day,
            day_name,
            is_working_day,
            start_time,
            end_time
          )
          VALUES ($1::smallint, $2::text, $3::boolean, $4::time, $5::time)
          ON CONFLICT (iso_day) DO UPDATE
          SET
            day_name = EXCLUDED.day_name,
            is_working_day = EXCLUDED.is_working_day,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            updated_at = NOW()
          `,
          [
            isoDayByName[day.day],
            day.day,
            day.isWorkingDay,
            day.startTime,
            day.endTime,
          ],
        );
      }

      const result = await client.query(
        `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        ORDER BY iso_day ASC
        `,
      );

      await client.query("COMMIT");
      return res.json({
        workingHours: result.rows.map(mapCompanyWorkingHourRow),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: error.message });
    } finally {
      client.release();
    }
  },
);

app.put(
  "/settings/company-working-hours/:workingHourId",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const workingHourId = Number(req.params.workingHourId);
    if (!Number.isInteger(workingHourId) || workingHourId <= 0) {
      return res.status(400).json({ error: "Invalid workingHourId" });
    }

    const parsed = companyWorkingHourUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const existingResult = await query(
        `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        WHERE working_hour_id = $1::bigint
        `,
        [workingHourId],
      );

      if (existingResult.rowCount === 0) {
        return res.status(404).json({ error: "Working-hour row not found" });
      }

      const existing = existingResult.rows[0];
      const payload = parsed.data;

      const resolvedDay = payload.day ?? existing.day_name;
      const resolvedIsWorkingDay =
        typeof payload.isWorkingDay === "boolean"
          ? payload.isWorkingDay
          : existing.is_working_day;

      let resolvedStartTime =
        Object.prototype.hasOwnProperty.call(payload, "startTime")
          ? payload.startTime
          : normalizeTimeValue(existing.start_time);
      let resolvedEndTime =
        Object.prototype.hasOwnProperty.call(payload, "endTime")
          ? payload.endTime
          : normalizeTimeValue(existing.end_time);

      if (!resolvedIsWorkingDay) {
        resolvedStartTime = null;
        resolvedEndTime = null;
      }

      const validationError = buildScheduleValidationError({
        day: resolvedDay,
        isWorkingDay: resolvedIsWorkingDay,
        startTime: resolvedStartTime,
        endTime: resolvedEndTime,
      });

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const updateResult = await query(
        `
        UPDATE app.company_settings_working_hours
        SET
          iso_day = $1::smallint,
          day_name = $2::text,
          is_working_day = $3::boolean,
          start_time = $4::time,
          end_time = $5::time,
          updated_at = NOW()
        WHERE working_hour_id = $6::bigint
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
        [
          isoDayByName[resolvedDay],
          resolvedDay,
          resolvedIsWorkingDay,
          resolvedStartTime,
          resolvedEndTime,
          workingHourId,
        ],
      );

      return res.json({
        workingHour: mapCompanyWorkingHourRow(updateResult.rows[0]),
      });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Working-hour row for this day already exists" });
      }
      return res.status(400).json({ error: error.message });
    }
  },
);

app.delete(
  "/settings/company-working-hours/:workingHourId",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const workingHourId = Number(req.params.workingHourId);
    if (!Number.isInteger(workingHourId) || workingHourId <= 0) {
      return res.status(400).json({ error: "Invalid workingHourId" });
    }

    try {
      const result = await query(
        `
        DELETE FROM app.company_settings_working_hours
        WHERE working_hour_id = $1::bigint
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
        [workingHourId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Working-hour row not found" });
      }

      return res.json({
        deleted: true,
        workingHour: mapCompanyWorkingHourRow(result.rows[0]),
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.get(
  "/employees",
  requireAuth,
  async (req, res) => {
    try {
      const rows = await withRlsContext(req.auth, async (client) => {
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
              ELSE e.attendance_status
            END AS attendance_status,
            e.employment_status,
            e.employment_type,
            ta.clock_in,
            ta.clock_out,
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
              ar.clock_in,
              ar.clock_out,
              ar.active_break_started_at
            FROM app.attendance_records ar
            WHERE ar.employee_id = e.employee_id
              AND ar.attendance_date = (NOW() AT TIME ZONE $1::text)::date
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
          ORDER BY e.employee_code
          LIMIT 500
          `,
          [attendanceTimeZone],
        );
        return result.rows;
      });

      return res.json({ employees: rows });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.post(
  "/employees",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = hrEmployeeCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;

    try {
      const employee = await withRlsContext(req.auth, async (client) => {
        if (payload.email != null) {
          const taken = await isEmailTakenByAnotherEmployee(client, payload.email);
          if (taken) {
            throw new Error("Email is already assigned to another employee");
          }
        }

        const nextResult = await client.query(
          `
          SELECT COALESCE(
            MAX((SUBSTRING(LOWER(employee_id) FROM '^emp-([0-9]+)$'))::int),
            0
          ) + 1 AS next_id
          FROM app.employees
          `,
        );

        const nextId = Number(nextResult.rows[0]?.next_id ?? 1);
        const employeeId = `emp-${nextId}`;
        const employeeCode = `WFP${new Date().getFullYear()}${String(nextId).padStart(4, "0")}`;

        await client.query(
          `
          INSERT INTO app.employees (
            employee_id,
            employee_code,
            first_name,
            last_name,
            email,
            phone,
            department_id,
            position,
            position_id,
            attendance_status,
            employment_status,
            employment_type,
            join_date,
            birthday,
            gender,
            nationality,
            marital_status,
            address,
            invitation_sent_date,
            password_changed,
            profile_picture_url
          )
          VALUES (
            $1::text,
            $2::text,
            $3::text,
            $4::text,
            $5::citext,
            $6::text,
            $7::bigint,
            $8::text,
            $9::bigint,
            'absent'::app.attendance_status,
            $10::app.employment_status,
            $11::app.employment_type,
            $12::date,
            $13::date,
            $14::text,
            $15::text,
            $16::text,
            $17::text,
            $18::date,
            $19::boolean,
            $20::text
          )
          `,
          [
            employeeId,
            employeeCode,
            payload.firstName,
            payload.lastName,
            payload.email ?? null,
            payload.phone ?? null,
            payload.departmentId ?? null,
            payload.position ?? null,
            payload.positionId ?? null,
            payload.employmentStatus ?? "onboarding",
            payload.employmentType,
            payload.joinDate ?? null,
            payload.birthday ?? null,
            payload.gender ?? null,
            payload.nationality ?? null,
            payload.maritalStatus ?? null,
            payload.address ?? null,
            payload.invitationSentDate ?? null,
            payload.passwordChanged ?? false,
            payload.profilePictureUrl ?? null,
          ],
        );

        await client.query(
          `
          INSERT INTO app.payroll_profiles (employee_id, salary, pag_ibig, phil_health, sss, tin)
          VALUES ($1::text, 0, '', '', '', '')
          ON CONFLICT (employee_id) DO NOTHING
          `,
          [employeeId],
        );

        return getEmployeeRowForApi(client, employeeId);
      });

      return res.status(201).json({ employee });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.patch(
  "/employees/:employeeId",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = hrEmployeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) {
      return res.status(400).json({ error: "Invalid employeeId" });
    }

    const fieldMap = {
      firstName: "first_name",
      lastName: "last_name",
      email: "email",
      phone: "phone",
      birthday: "birthday",
      gender: "gender",
      nationality: "nationality",
      maritalStatus: "marital_status",
      address: "address",
      departmentId: "department_id",
      employmentType: "employment_type",
      position: "position",
      positionId: "position_id",
      employmentStatus: "employment_status",
      joinDate: "join_date",
      invitationSentDate: "invitation_sent_date",
      passwordChanged: "password_changed",
      profilePictureUrl: "profile_picture_url",
    };

    const assignments = [];
    const params = [];
    for (const [jsonKey, dbColumn] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
        params.push(payload[jsonKey]);
        assignments.push(`${dbColumn} = $${params.length}`);
      }
    }

    if (assignments.length === 0) {
      return res.status(400).json({ error: "No fields provided" });
    }

    try {
      const employee = await withRlsContext(req.auth, async (client) => {
        const resolvedEmployeeId = await resolveEmployeeId(client, employeeId);
        if (!resolvedEmployeeId) {
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "email") && payload.email != null) {
          const taken = await isEmailTakenByAnotherEmployee(
            client,
            payload.email,
            resolvedEmployeeId,
          );
          if (taken) {
            throw new Error("Email is already assigned to another employee");
          }
        }

        const updateParams = [...params, resolvedEmployeeId];
        const updateResult = await client.query(
          `
          UPDATE app.employees
          SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE employee_id = $${updateParams.length}::text
          RETURNING employee_id
          `,
          updateParams,
        );

        if (updateResult.rowCount === 0) {
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "positionId")) {
          await client.query(
            `
            UPDATE app.employees e
            SET position = jp.name
            FROM app.job_positions jp
            WHERE e.employee_id = $1::text
              AND jp.position_id = e.position_id
            `,
            [resolvedEmployeeId],
          );

          if (payload.positionId === null) {
            await client.query(
              `
              UPDATE app.employees
              SET position = NULL
              WHERE employee_id = $1::text
              `,
              [resolvedEmployeeId],
            );
          }
        }

        return getEmployeeRowForApi(client, resolvedEmployeeId);
      });

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      return res.json({ employee });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.put(
  "/employees/:employeeId/payroll",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    const parsed = hrPayrollUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) {
      return res.status(400).json({ error: "Invalid employeeId" });
    }

    try {
      const employee = await withRlsContext(req.auth, async (client) => {
        const resolvedEmployeeId = await resolveEmployeeId(client, employeeId);
        if (!resolvedEmployeeId) {
          return null;
        }

        const employeeExists = await client.query(
          `
          SELECT employee_id
          FROM app.employees
          WHERE employee_id = $1::text
          `,
          [resolvedEmployeeId],
        );

        if (employeeExists.rowCount === 0) {
          return null;
        }

        await client.query(
          `
          INSERT INTO app.payroll_profiles (
            employee_id,
            salary,
            pag_ibig,
            phil_health,
            sss,
            tin
          )
          VALUES ($1::text, $2::numeric, $3::text, $4::text, $5::text, $6::text)
          ON CONFLICT (employee_id) DO UPDATE
          SET
            salary = EXCLUDED.salary,
            pag_ibig = EXCLUDED.pag_ibig,
            phil_health = EXCLUDED.phil_health,
            sss = EXCLUDED.sss,
            tin = EXCLUDED.tin,
            updated_at = NOW()
          `,
          [
            resolvedEmployeeId,
            payload.salary,
            payload.governmentIds.pagIbig,
            payload.governmentIds.philHealth,
            payload.governmentIds.sss,
            payload.governmentIds.tin,
          ],
        );

        await client.query(
          `
          DELETE FROM app.payroll_deductions
          WHERE employee_id = $1::text
          `,
          [resolvedEmployeeId],
        );

        for (let index = 0; index < payload.deductions.length; index += 1) {
          const deduction = payload.deductions[index];
          const fallbackId = `ded-${resolvedEmployeeId}-${index + 1}-${Date.now()}`;
          const deductionId = deduction.id && deduction.id.trim().length > 0
            ? deduction.id.trim()
            : fallbackId;

          await client.query(
            `
            INSERT INTO app.payroll_deductions (
              deduction_id,
              employee_id,
              deduction_name,
              amount
            )
            VALUES ($1::text, $2::text, $3::text, $4::numeric)
            `,
            [deductionId, resolvedEmployeeId, deduction.name, deduction.amount],
          );
        }

        return getEmployeeRowForApi(client, resolvedEmployeeId);
      });

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      return res.json({ employee });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

app.get(
  "/hr/employees",
  requireAuth,
  requireRole("admin", "hr_manager"),
  async (req, res) => {
    try {
      const rows = await withRlsContext(req.auth, async (client) => {
        const result = await client.query(
          `
          SELECT
            e.employee_id,
            e.employee_code,
            e.first_name,
            e.last_name,
            e.email,
            d.name AS department,
            e.position,
            e.attendance_status,
            e.employment_status
          FROM app.employees e
          LEFT JOIN app.departments d ON d.department_id = e.department_id
          ORDER BY e.employee_code
          LIMIT 200
          `,
        );
        return result.rows;
      });

      return res.json({ employees: rows });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
);

if (process.argv.includes("--check")) {
  console.log("API configuration check passed.");
  console.log(`Port: ${port}`);
  process.exit(0);
}

const server = app.listen(port, () => {
  console.log(`WFH-PULSE API listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  server.close(async () => {
    await pool.end().catch(() => {
      // Ignore pool close errors.
    });
    process.exit(0);
  });
});

