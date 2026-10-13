import { z } from "zod";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentLogs, subscriptions, user as users } from "@/server/schema";
import { forbidden, getUser, isAdmin, logAdmin, unauthorized } from "@/server/auth";
import { parseBody } from "@/server/validate";
import { deleteStripeCustomer } from "@/server/stripe";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "User not found" }, { status: 404 });
const summary = { id: users.id, email: users.email, name: users.name, plan: users.plan, premiumUntil: users.premiumUntil };

// One account's subscriptions and payments. Explicit columns: never the password hash or Stripe id.
export async function GET(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const { id } = await params;
    const [user] = await db.select({ ...summary, created_at: users.createdAt }).from(users).where(eq(users.id, id));
    if (!user) return notFound();
    logAdmin(admin, "view-user", id);
    const [subs, payments] = await Promise.all([
        db
            .select({
                id: subscriptions.id,
                name: subscriptions.name,
                price: subscriptions.price,
                due_date: subscriptions.due_date,
                status: subscriptions.status,
                category: subscriptions.category,
            })
            .from(subscriptions)
            .where(eq(subscriptions.user_id, id))
            .orderBy(asc(subscriptions.due_date)),
        db
            .select({
                id: paymentLogs.id,
                amount: paymentLogs.amount,
                status: paymentLogs.status,
                plan: paymentLogs.plan,
                created_at: paymentLogs.created_at,
            })
            .from(paymentLogs)
            .where(eq(paymentLogs.user_id, id))
            .orderBy(desc(paymentLogs.created_at)),
    ]);
    return Response.json({ user, subscriptions: subs, payments });
}

// Manual plan override. Note: an active Stripe subscription re-applies premium on its next paid invoice.
export async function PATCH(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const body = await parseBody(req, z.object({ plan: z.enum(["free", "premium"]), days: z.number().int().min(1).max(3650).default(30) }));
    if (body instanceof Response) return body;

    const { id } = await params;
    const until = body.plan === "premium" ? new Date(Date.now() + body.days * 86_400_000) : null;
    const [updated] = await db
        .update(users)
        .set({ plan: body.plan, premiumUntil: until, updatedAt: sql`now()` })
        .where(eq(users.id, id))
        .returning(summary);
    if (!updated) return notFound();
    logAdmin(admin, `set-plan:${body.plan}`, id);
    return Response.json(updated);
}

// Deletes the account and, via ON DELETE CASCADE, its subscriptions, settings and payment logs.
// The Stripe customer goes first: if Stripe fails, nothing is deleted and the user isn't left being billed.
export async function DELETE(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const { id } = await params;
    if (id === admin.id) return Response.json({ error: "You can't delete your own account here" }, { status: 400 });
    const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, id));
    if (!user) return notFound();
    await deleteStripeCustomer(user.stripeCustomerId);
    const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (!deleted.length) return notFound();
    logAdmin(admin, "delete-user", id);
    return Response.json({ deleted: true });
}
