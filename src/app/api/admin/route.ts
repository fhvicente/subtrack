import { type AnyColumn, type SQL, and, count, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentLogs, subscriptions, user as users } from "@/server/schema";
import { forbidden, getUser, isAdmin, unauthorized } from "@/server/auth";

// Postgres aggregate FILTERs, which Drizzle has no builder for.
const countWhere = (cond: SQL | undefined) => sql<number>`count(*) FILTER (WHERE ${cond})`.mapWith(Number);
const sumWhere = (col: AnyColumn, cond: SQL | undefined) =>
    sql<number>`coalesce(sum(${col}) FILTER (WHERE ${cond}), 0)`.mapWith(Number);
const last30 = (col: AnyColumn) => gt(col, sql`now() - interval '30 days'`);
const premiumActive = and(eq(users.plan, "premium"), gt(users.premiumUntil, sql`now()`));
const categoryName = sql<string>`coalesce(nullif(${subscriptions.category}, ''), 'Other')`;

// KPIs + the user list for the admin panel. `?q=` filters users by email or name.
export async function GET(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();
    if (!isAdmin(user)) return forbidden();

    const params = new URL(req.url).searchParams;
    const q = `%${params.get("q")?.trim() ?? ""}%`;
    // Unknown values fall back to all payments.
    const status = ["success", "failed"].includes(params.get("status") ?? "") ? params.get("status") : null;
    const [[people], [subs], [payments], categories, list, recentPayments] = await Promise.all([
        db
            .select({ total: count(), new30: countWhere(last30(users.createdAt)), premium: countWhere(premiumActive) })
            .from(users),
        db
            .select({
                total: count(),
                users: sql<number>`count(DISTINCT ${subscriptions.user_id})`.mapWith(Number),
                activeValue: sumWhere(subscriptions.price, eq(subscriptions.status, "active")),
            })
            .from(subscriptions),
        db
            .select({
                revenue30: sumWhere(paymentLogs.amount, and(eq(paymentLogs.status, "success"), last30(paymentLogs.created_at))),
                revenueTotal: sumWhere(paymentLogs.amount, eq(paymentLogs.status, "success")),
                failed30: countWhere(and(eq(paymentLogs.status, "failed"), last30(paymentLogs.created_at))),
            })
            .from(paymentLogs),
        db
            .select({ name: categoryName, count: count() })
            .from(subscriptions)
            .groupBy(categoryName)
            .orderBy(desc(count()))
            .limit(5),
        // ponytail: capped at 100 rows, add pagination when the search box stops being enough.
        db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                plan: users.plan,
                premiumUntil: users.premiumUntil,
                created_at: users.createdAt,
                subscriptions: count(subscriptions.id),
            })
            .from(users)
            .leftJoin(subscriptions, eq(subscriptions.user_id, users.id))
            .where(or(ilike(users.email, q), ilike(users.name, q)))
            .groupBy(users.id)
            .orderBy(desc(users.createdAt))
            .limit(100),
        db
            .select({
                id: paymentLogs.id,
                amount: paymentLogs.amount,
                status: paymentLogs.status,
                plan: paymentLogs.plan,
                created_at: paymentLogs.created_at,
                email: users.email,
            })
            .from(paymentLogs)
            .innerJoin(users, eq(users.id, paymentLogs.user_id))
            .where(status ? eq(paymentLogs.status, status) : undefined)
            .orderBy(desc(paymentLogs.created_at))
            .limit(50),
    ]);

    return Response.json({
        kpis: {
            users: people.total,
            newUsers30: people.new30,
            premiumUsers: people.premium,
            conversion: people.total ? people.premium / people.total : 0,
            revenue30: payments.revenue30,
            revenueTotal: payments.revenueTotal,
            failedPayments30: payments.failed30,
            subscriptions: subs.total,
            activationRate: people.total ? subs.users / people.total : 0,
            trackedMonthlyValue: subs.activeValue,
        },
        categories,
        users: list,
        recentPayments,
    });
}
