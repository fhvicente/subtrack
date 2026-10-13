import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentLogs } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";

export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    return Response.json(
        await db.select().from(paymentLogs).where(eq(paymentLogs.user_id, user.id)).orderBy(desc(paymentLogs.created_at))
    );
}
