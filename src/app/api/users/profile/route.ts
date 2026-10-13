import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user as users } from "@/server/schema";
import { clearSessionCookies, getUser, isAdmin, unauthorized } from "@/server/auth";
import { deleteStripeCustomer } from "@/server/stripe";
import { parseBody } from "@/server/validate";

const profile = async (id: string) =>
    (
        await db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                plan: users.plan,
                created_at: users.createdAt,
                updated_at: users.updatedAt,
            })
            .from(users)
            .where(eq(users.id, id))
    )[0];

export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    return Response.json({ ...(await profile(user.id)), isAdmin: isAdmin(user) });
}

export async function PUT(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(100) }));
    if (body instanceof Response) return body;
    await db.update(users).set({ name: body.name, updatedAt: sql`now()` }).where(eq(users.id, user.id));
    return Response.json(await profile(user.id));
}

// RGPD Art. 17: the user deletes their own account. Stripe first (stops billing), then the "user" row;
// ON DELETE CASCADE removes sessions, accounts, subscriptions, settings and payment logs.
export async function DELETE(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    await deleteStripeCustomer(user.stripeCustomerId);
    await db.delete(users).where(eq(users.id, user.id));
    return Response.json({ deleted: true }, { headers: clearSessionCookies() });
}
