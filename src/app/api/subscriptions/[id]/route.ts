import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { subscriptions } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";
import { parseBody } from "@/server/validate";
import { subscriptionUpdateSchema } from "@/lib/subscription-schema";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ message: "Subscription not found" }, { status: 404 });
const own = (id: string, userId: string) => and(eq(subscriptions.id, id), eq(subscriptions.user_id, userId));
const find = async (id: string, userId: string) =>
    (await db.select().from(subscriptions).where(own(id, userId)))[0];

export async function GET(req: Request, { params }: Ctx) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const subscription = await find((await params).id, user.id);
    return subscription ? Response.json(subscription) : notFound();
}

export async function PUT(req: Request, { params }: Ctx) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    if (!await find(id, user.id)) return notFound();

    const body = await parseBody(req, subscriptionUpdateSchema);
    if (body instanceof Response) return body;
    if (!Object.keys(body).length) {
        return Response.json({ message: "No fields to update" }, { status: 400 });
    }

    const { dueDate, ...fields } = body;
    const [updated] = await db
        .update(subscriptions)
        .set({ ...fields, ...(dueDate && { due_date: new Date(dueDate) }), updated_at: sql`now()` })
        .where(own(id, user.id))
        .returning();
    return Response.json(updated);
}

export async function DELETE(req: Request, { params }: Ctx) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const deleted = await db.delete(subscriptions).where(own(id, user.id)).returning({ id: subscriptions.id });
    return deleted.length ? new Response(null, { status: 204 }) : notFound();
}
