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
    const rows = await withRlsContext(req.auth, async (client) => {
      const result = await client.query(
        `
        SELECT attendance_date, status, clock_in, clock_out, work_duration_minutes, late_minutes
        FROM app.attendance_records
        ${filterSql}
        ORDER BY attendance_date DESC
        LIMIT 90
        `,
        params,
      );
      return result.rows;
    });

    return res.json({ attendance: rows });
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

