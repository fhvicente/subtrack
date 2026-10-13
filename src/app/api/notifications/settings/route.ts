import { randomUUID } from "node:crypto";
import { z } from "zod";
import { get, run } from "@/server/db";
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

const settingsOf = (userId: string) =>
    get("SELECT * FROM notification_settings WHERE user_id = ?", [userId]);

// Creates default settings on first access.
async function ensureSettings(userId: string) {
    await run("INSERT INTO notification_settings (id, user_id) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING", [
        randomUUID(),
        userId,
    ]);
    return (await settingsOf(userId))!;
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
    const current = await ensureSettings(user.id);
    const pick = (key: keyof typeof body) => (body[key] !== undefined ? body[key] : current[key]);

    await run(
        `UPDATE notification_settings
         SET email_enabled = ?, sms_enabled = ?, push_enabled = ?, days_before_renewal = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [
            pick("email_enabled"),
            pick("sms_enabled"),
            pick("push_enabled"),
            pick("days_before_renewal"),
            user.id,
        ]
    );
    return Response.json(await settingsOf(user.id));
}
