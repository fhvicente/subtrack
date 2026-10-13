import { lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { rateLimits, session, verification } from "@/server/schema";
import { checkUpcomingRenewals } from "@/server/email";

// Called daily by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
    if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    // Storage limitation (RGPD Art. 5(1)(e)): expired sessions carry IP + user agent, verifications carry emails.
    await db.delete(rateLimits).where(lt(rateLimits.reset_at, sql`now()`));
    await db.delete(session).where(lt(session.expiresAt, sql`now()`));
    await db.delete(verification).where(lt(verification.expiresAt, sql`now()`));
    return Response.json({ sent: await checkUpcomingRenewals() });
}
