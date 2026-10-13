import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentLogs, user } from "@/server/schema";
import { paymentsDisabled, stripe } from "@/server/stripe";

const DAY = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) return paymentsDisabled();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            await req.text(),
            req.headers.get("stripe-signature") ?? "",
            secret
        );
    } catch (err) {
        return Response.json({ message: `Webhook Error: ${(err as Error).message}` }, { status: 400 });
    }

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            const userId = session.metadata?.userId;
            const plan = session.metadata?.plan;
            if (!userId || session.payment_status !== "paid") break;

            await db
                .update(user)
                .set({ plan: "premium", premiumUntil: new Date(Date.now() + 30 * DAY) })
                .where(eq(user.id, userId));
            await db.insert(paymentLogs).values({
                id: randomUUID(),
                user_id: userId,
                amount: (session.amount_total ?? 0) / 100,
                status: "success",
                stripeSessionId: session.id,
                plan,
            });
            break;
        }
        // Every paid invoice, renewals included, extends premium to the end of the billed period.
        case "invoice.paid": {
            const invoice = event.data.object;
            const periodEnd = invoice.lines.data[0]?.period.end;
            if (periodEnd) {
                await db
                    .update(user)
                    .set({ plan: "premium", premiumUntil: new Date(periodEnd * 1000) })
                    .where(eq(user.stripeCustomerId, String(invoice.customer)));
            }
            break;
        }
        case "invoice.payment_failed": {
            const invoice = event.data.object;
            const [customer] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.stripeCustomerId, String(invoice.customer)));
            if (customer) {
                await db.insert(paymentLogs).values({
                    id: randomUUID(),
                    user_id: customer.id,
                    amount: (invoice.amount_due ?? 0) / 100,
                    status: "failed",
                    stripeSessionId: invoice.id,
                });
            }
            break;
        }
        case "customer.subscription.deleted": {
            await db
                .update(user)
                .set({ plan: "free", premiumUntil: null })
                .where(eq(user.stripeCustomerId, String(event.data.object.customer)));
            break;
        }
    }
    return Response.json({ received: true });
}
