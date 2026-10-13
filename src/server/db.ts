import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { rateLimits } from "./schema";

// Tables come from the migrations in drizzle/ (`npm run db:migrate`), never from the app at runtime.
export const db = drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL }) });

// Fixed-window counter in Postgres, so the limit holds across serverless instances.
// Returns true once `key` went over `limit` hits inside the window. Expired rows are pruned by the daily cron.
export async function rateLimited(key: string, limit: number, windowSeconds: number) {
    const expired = sql`${rateLimits.reset_at} < now()`;
    const [row] = await db
        .insert(rateLimits)
        .values({ key, count: 1, reset_at: sql`now() + make_interval(secs => ${windowSeconds})` })
        .onConflictDoUpdate({
            target: rateLimits.key,
            set: {
                count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
                reset_at: sql`CASE WHEN ${expired} THEN excluded.reset_at ELSE ${rateLimits.reset_at} END`,
            },
        })
        .returning({ count: rateLimits.count });
    return row.count > limit;
}
