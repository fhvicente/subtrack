import { query } from "@/server/db";
import { getUser, unauthorized } from "@/server/auth";

// RGPD Art. 15 / 20: everything we hold about the user, as a JSON download.
// Explicit columns: never the password hash, session tokens or OAuth tokens.
export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const [subscriptions, notificationSettings, payments, sessions] = await Promise.all([
        query(`SELECT id, name, description, due_date, price, status, category, created_at, updated_at
               FROM subscriptions WHERE user_id = ? ORDER BY created_at`, [user.id]),
        query(`SELECT email_enabled, sms_enabled, push_enabled, days_before_renewal, created_at, updated_at
               FROM notification_settings WHERE user_id = ?`, [user.id]),
        query(`SELECT id, amount, status, provider, plan, notes, created_at
               FROM payment_logs WHERE user_id = ? ORDER BY created_at`, [user.id]),
        query(`SELECT "ipAddress", "userAgent", "createdAt", "expiresAt"
               FROM session WHERE "userId" = ? ORDER BY "createdAt"`, [user.id]),
    ]);
    const data = {
        exportedAt: new Date().toISOString(),
        profile: {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            plan: user.plan,
            premiumUntil: user.premiumUntil,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        },
        subscriptions,
        notificationSettings: notificationSettings[0] ?? null,
        payments,
        sessions,
    };
    return new Response(JSON.stringify(data, null, 2), {
        headers: {
            "content-type": "application/json",
            "content-disposition": 'attachment; filename="subtrack-data.json"',
            "cache-control": "no-store",
        },
    });
}
