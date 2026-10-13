import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { notificationSettings, paymentLogs, session, subscriptions } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";

// RGPD Art. 15 / 20: everything we hold about the user, as a JSON download.
// Explicit columns: never the password hash, session tokens or OAuth tokens.
export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const [subs, settings, payments, sessions] = await Promise.all([
        db
            .select({
                id: subscriptions.id,
                name: subscriptions.name,
                description: subscriptions.description,
                due_date: subscriptions.due_date,
                price: subscriptions.price,
                status: subscriptions.status,
                category: subscriptions.category,
                created_at: subscriptions.created_at,
                updated_at: subscriptions.updated_at,
            })
            .from(subscriptions)
            .where(eq(subscriptions.user_id, user.id))
            .orderBy(asc(subscriptions.created_at)),
        db
            .select({
                email_enabled: notificationSettings.email_enabled,
                sms_enabled: notificationSettings.sms_enabled,
                push_enabled: notificationSettings.push_enabled,
                days_before_renewal: notificationSettings.days_before_renewal,
                created_at: notificationSettings.created_at,
                updated_at: notificationSettings.updated_at,
            })
            .from(notificationSettings)
            .where(eq(notificationSettings.user_id, user.id)),
        db
            .select({
                id: paymentLogs.id,
                amount: paymentLogs.amount,
                status: paymentLogs.status,
                provider: paymentLogs.provider,
                plan: paymentLogs.plan,
                notes: paymentLogs.notes,
                created_at: paymentLogs.created_at,
            })
            .from(paymentLogs)
            .where(eq(paymentLogs.user_id, user.id))
            .orderBy(asc(paymentLogs.created_at)),
        db
            .select({
                ipAddress: session.ipAddress,
                userAgent: session.userAgent,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
            })
            .from(session)
            .where(eq(session.userId, user.id))
            .orderBy(asc(session.createdAt)),
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
        subscriptions: subs,
        notificationSettings: settings[0] ?? null,
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
