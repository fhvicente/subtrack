import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentLogs, user as users } from "@/server/schema";
import { getUser, unauthorized } from "@/server/auth";
import { stripe } from "@/server/stripe";

export async function POST(req: Request) {
    const user = await getUser(req);
    if (!user) return unauthorized();

    if (stripe && user.stripeCustomerId) {
        try {
            const subs = await stripe.subscriptions.list({
                customer: user.stripeCustomerId,
                status: "active",
            });
            for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id);
        } catch (error) {
            // Don't downgrade locally while Stripe keeps billing: the user would pay for a free plan.
            console.error("Error canceling Stripe subscription:", error);
            return Response.json(
                { success: false, message: "Could not cancel the subscription, please try again." },
                { status: 502 }
            );
        }
    }

    await db.update(users).set({ plan: "free" }).where(eq(users.id, user.id));
    await db.insert(paymentLogs).values({
        id: randomUUID(),
        user_id: user.id,
        amount: 0,
        status: "canceled",
        notes: "Subscription canceled by user",
    });
    return Response.json({ success: true, message: "Subscription has been canceled successfully." });
}
