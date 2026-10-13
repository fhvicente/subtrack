import { Pool } from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

// camelCase columns are quoted so Postgres keeps their case (the frontend reads `premiumUntil`);
// the better-auth tables use its default names.
const schema = `
-- better-auth's default schema (src/server/better-auth.ts). "user" is quoted: it's a reserved word.
-- plan / premiumUntil / stripeCustomerId are better-auth additionalFields.
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan TEXT NOT NULL DEFAULT 'free',
  "premiumUntil" TIMESTAMPTZ,
  "stripeCustomerId" TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rateLimit" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user" (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'active',
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  email_enabled INTEGER DEFAULT 1,
  sms_enabled INTEGER DEFAULT 0,
  push_enabled INTEGER DEFAULT 0,
  days_before_renewal INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  provider TEXT DEFAULT 'stripe',
  "stripeSessionId" TEXT,
  plan TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
`;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Schema is applied on the first query, so `next build` never needs a database.
let ready: Promise<unknown> | undefined;

type Param = string | number | boolean | Date | null | undefined;
// Booleans stay 1/0 because the frontend compares the toggles with `=== 1`.
const bind = (params: Param[]) =>
    params.map((p) => (typeof p === "boolean" ? Number(p) : (p ?? null)));
// ponytail: `?` -> `$n` keeps the SQL as written; breaks only if a query ever contains a literal `?`.
const numbered = (sql: string) => {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
};

// better-auth queries `pool` directly, so its callers await this too (see src/server/auth.ts).
export const ensureSchema = () =>
    (ready ??= pool.query(schema).catch((err) => {
        ready = undefined; // retry on the next request, e.g. if the DB wasn't up yet
        throw err;
    }));

async function exec(sql: string, params: Param[]) {
    await ensureSchema();
    return pool.query(numbered(sql), bind(params));
}

export const query = async (sql: string, params: Param[] = []) =>
    (await exec(sql, params)).rows as Row[];

export const get = async (sql: string, params: Param[] = []) =>
    (await exec(sql, params)).rows[0] as Row | undefined;

export const run = async (sql: string, params: Param[] = []) => ({
    changes: (await exec(sql, params)).rowCount ?? 0,
});

// Fixed-window counter in Postgres, so the limit holds across serverless instances.
// Returns true once `key` went over `limit` hits inside the window. Expired rows are pruned by the daily cron.
export async function rateLimited(key: string, limit: number, windowSeconds: number) {
    const row = await get(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, now() + make_interval(secs => ?))
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
           reset_at = CASE WHEN rate_limits.reset_at < now() THEN excluded.reset_at ELSE rate_limits.reset_at END
         RETURNING count`,
        [key, windowSeconds]
    );
    return row!.count > limit;
}
