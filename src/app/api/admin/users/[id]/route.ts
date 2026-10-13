import { z } from "zod";
import { get, query, run } from "@/server/db";
import { forbidden, getUser, isAdmin, logAdmin, unauthorized } from "@/server/auth";
import { parseBody } from "@/server/validate";
import { deleteStripeCustomer } from "@/server/stripe";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "User not found" }, { status: 404 });

// One account's subscriptions and payments. Explicit columns: never the password hash or Stripe id.
export async function GET(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const { id } = await params;
    const user = await get(`SELECT id, email, name, plan, "premiumUntil", "createdAt" AS created_at FROM "user" WHERE id = ?`, [id]);
    if (!user) return notFound();
    logAdmin(admin, "view-user", id);
    const [subscriptions, payments] = await Promise.all([
        query(`SELECT id, name, price, due_date, status, category FROM subscriptions WHERE user_id = ? ORDER BY due_date`, [id]),
        query(`SELECT id, amount, status, plan, created_at FROM payment_logs WHERE user_id = ? ORDER BY created_at DESC`, [id]),
    ]);
    return Response.json({ user, subscriptions, payments });
}

// Manual plan override. Note: an active Stripe subscription re-applies premium on its next paid invoice.
export async function PATCH(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const body = await parseBody(req, z.object({ plan: z.enum(["free", "premium"]), days: z.number().int().min(1).max(3650).default(30) }));
    if (body instanceof Response) return body;

    const until = body.plan === "premium" ? new Date(Date.now() + body.days * 86_400_000).toISOString() : null;
    const { changes } = await run(
        `UPDATE "user" SET plan = ?, "premiumUntil" = ?, "updatedAt" = now() WHERE id = ?`,
        [body.plan, until, (await params).id]
    );
    if (!changes) return notFound();
    logAdmin(admin, `set-plan:${body.plan}`, (await params).id);
    return Response.json(await get(`SELECT id, email, name, plan, "premiumUntil" FROM "user" WHERE id = ?`, [(await params).id]));
}

// Deletes the account and, via ON DELETE CASCADE, its subscriptions, settings and payment logs.
// The Stripe customer goes first: if Stripe fails, nothing is deleted and the user isn't left being billed.
export async function DELETE(req: Request, { params }: Ctx) {
    const admin = await getUser(req);
    if (!admin) return unauthorized();
    if (!isAdmin(admin)) return forbidden();
    const { id } = await params;
    if (id === admin.id) return Response.json({ error: "You can't delete your own account here" }, { status: 400 });
    const user = await get(`SELECT "stripeCustomerId" FROM "user" WHERE id = ?`, [id]);
    if (!user) return notFound();
    await deleteStripeCustomer(user.stripeCustomerId);
    const { changes } = await run(`DELETE FROM "user" WHERE id = ?`, [id]);
    if (!changes) return notFound();
    logAdmin(admin, "delete-user", id);
    return Response.json({ deleted: true });
}
