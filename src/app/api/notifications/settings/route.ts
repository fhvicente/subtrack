import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notificationSettings } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";
import { parseBody } from "@/server/validate";

// The settings page sends the toggles as 1/0; booleans are accepted too (stored as 1/0).
const toggle = z.union([z.boolean(), z.literal(0), z.literal(1)]);
const settingsSchema = z
    .object({
        email_enabled: toggle,
        sms_enabled: toggle,
        push_enabled: toggle,
        days_before_renewal: z.int().min(1).max(30),
    })
    .partial();

const ofUser = (userId: string) => eq(notificationSettings.user_id, userId);
const toInt = (v: boolean | number | undefined) => (v === undefined ? undefined : Number(v));

// Creates default settings on first access.
async function ensureSettings(userId: string) {
    await db
        .insert(notificationSettings)
        .values({ id: randomUUID(), user_id: userId })
        .onConflictDoNothing({ target: notificationSettings.user_id });
    return (await db.select().from(notificationSettings).where(ofUser(userId)))[0];
}

export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    return Response.json(await ensureSettings(user.id));
}

export async function PUT(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const body = await parseBody(req, settingsSchema);
    if (body instanceof Response) return body;
    await ensureSettings(user.id);
    // Fields left undefined are skipped by Drizzle, so they keep their current value.
    const [updated] = await db
        .update(notificationSettings)
        .set({
            email_enabled: toInt(body.email_enabled),
            sms_enabled: toInt(body.sms_enabled),
            push_enabled: toInt(body.push_enabled),
            days_before_renewal: body.days_before_renewal,
            updated_at: sql`now()`,
        })
        .where(ofUser(user.id))
        .returning();
    return Response.json(updated);
}
