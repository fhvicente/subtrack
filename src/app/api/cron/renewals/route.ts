import { run } from "@/server/db";
import { checkUpcomingRenewals } from "@/server/email";

// Called daily by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
    if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    // Storage limitation (RGPD Art. 5(1)(e)): expired sessions carry IP + user agent, verifications carry emails.
    await run("DELETE FROM rate_limits WHERE reset_at < now()");
    await run(`DELETE FROM session WHERE "expiresAt" < now()`);
    await run(`DELETE FROM verification WHERE "expiresAt" < now()`);
    return Response.json({ sent: await checkUpcomingRenewals() });
}
