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

const selfProfileUpdateSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(3).max(50).optional(),
    birthday: z.string().date().optional(),
    gender: z.string().min(1).max(50).optional(),
    nationality: z.string().min(1).max(100).optional(),
    maritalStatus: z.string().min(1).max(100).optional(),
    address: z.string().min(3).max(300).optional(),
    profilePictureUrl: z.string().url().max(1000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

async function getUserProfileByUserId(userId) {
  const profileResult = await query(
    `
    SELECT u.user_id, u.email, u.employee_id,
           e.first_name, e.last_name
    FROM auth.users u
    LEFT JOIN app.employees e ON e.employee_id = u.employee_id
    WHERE u.user_id = $1::uuid
    `,
    [userId],
  );
  return profileResult.rows[0] ?? null;
}

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    const result = await query(
      `SELECT * FROM auth.login_user($1::citext, $2::text, $3::inet, $4::text)`,
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
      `SELECT * FROM auth.refresh_session($1::uuid, $2::text, $3::inet, $4::text)`,
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
        `SELECT auth.register_user($1::citext, $2::text, $3::text, $4::text) AS user_id`,
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
    await query("SELECT auth.revoke_session($1::uuid)", [req.auth.sessionId]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/me/profile", requireAuth, async (req, res) => {
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
          e.department_id,
          d.name AS department,
          e.position,
          e.attendance_status,
          e.employment_status,
          e.employment_type,
          e.phone,
          e.join_date,
          e.birthday
        FROM app.employees e
        LEFT JOIN app.departments d ON d.department_id = e.department_id
        WHERE e.employee_id = app.current_employee_id()
        `,
      );
      return result.rows;
    });

    return res.json({ profile: rows[0] ?? null });
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
  const assignments = [];
  const params = [];

  const fieldMap = {
    email: "email",
    phone: "phone",
    birthday: "birthday",
    gender: "gender",
    nationality: "nationality",
    maritalStatus: "marital_status",
    address: "address",
    profilePictureUrl: "profile_picture_url",
  };

  for (const [jsonKey, dbColumn] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
      params.push(payload[jsonKey]);
      assignments.push(`${dbColumn} = $${params.length}`);
    }
  }

  try {
    const row = await withRlsContext(req.auth, async (client) => {
      const result = await client.query(
        `
        UPDATE app.employees
        SET ${assignments.join(", ")}
        WHERE employee_id = app.current_employee_id()
        RETURNING employee_id, email, phone, birthday, gender, nationality, marital_status, address, profile_picture_url
        `,
        params,
      );
      return result.rows[0] ?? null;
    });

    return res.json({ profile: row });
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

