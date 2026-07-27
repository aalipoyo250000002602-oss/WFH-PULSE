import express from "express";
import cors from "cors";
import process from "node:process";
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

