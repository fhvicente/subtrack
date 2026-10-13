import { z } from "zod";
import { get, run } from "@/server/db";
import { clearSessionCookies, getUser, isAdmin, unauthorized } from "@/server/auth";
import { deleteStripeCustomer } from "@/server/stripe";
import { parseBody } from "@/server/validate";

const profile = (id: string) =>
    get(`SELECT id, email, name, plan, "createdAt" AS created_at, "updatedAt" AS updated_at FROM "user" WHERE id = ?`, [id]);

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
    await run(`UPDATE "user" SET name = ?, "updatedAt" = now() WHERE id = ?`, [body.name, user.id]);
    return Response.json(await profile(user.id));
}

// RGPD Art. 17: the user deletes their own account. Stripe first (stops billing), then the "user" row;
// ON DELETE CASCADE removes sessions, accounts, subscriptions, settings and payment logs.
export async function DELETE(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    await deleteStripeCustomer(user.stripeCustomerId);
    await run(`DELETE FROM "user" WHERE id = ?`, [user.id]);
    return Response.json({ deleted: true }, { headers: clearSessionCookies() });
}
