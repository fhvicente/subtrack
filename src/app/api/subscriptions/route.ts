import { randomUUID } from "node:crypto";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { subscriptions } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";
import { isPremiumActive } from "@/server/stripe";
import { z } from "zod";
import { FREE_PLAN_LIMIT, subscriptionCreateSchema } from "@/lib/subscription-schema";

export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    return Response.json(
        await db.select().from(subscriptions).where(eq(subscriptions.user_id, user.id)).orderBy(asc(subscriptions.due_date))
    );
}

export async function POST(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const parsed = subscriptionCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return Response.json(
            { message: "Invalid subscription", errors: z.flattenError(parsed.error).fieldErrors },
            { status: 400 }
        );
    }

    // ponytail: count-then-insert can let two parallel requests reach 4; fine for a UI-driven limit.
    if (!isPremiumActive(user)) {
        const [{ total }] = await db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.user_id, user.id));
        if (total >= FREE_PLAN_LIMIT) {
            return Response.json(
                { code: "FREE_PLAN_LIMIT", message: `The free plan tracks up to ${FREE_PLAN_LIMIT} subscriptions` },
                { status: 403 }
            );
        }
    }

    const { dueDate, ...fields } = parsed.data;
    const [created] = await db
        .insert(subscriptions)
        .values({ ...fields, id: randomUUID(), user_id: user.id, due_date: new Date(dueDate) })
        .returning();
    return Response.json(created, { status: 201 });
}
