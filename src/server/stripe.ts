import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// null when Stripe isn't configured (local dev); payment routes answer 503.
export const stripe = key?.startsWith("sk_") ? new Stripe(key) : null;

export const paymentsDisabled = () =>
    Response.json({ message: "Payments are not configured" }, { status: 503 });

export const isPremiumActive = (user: { plan?: string; premiumUntil?: string | null }) =>
    user.plan === "premium" && !!user.premiumUntil && new Date(user.premiumUntil) > new Date();

// Deleting the Stripe customer also cancels its subscriptions immediately, so a deleted account is never billed again.
// Invoices stay in Stripe, which is where the tax records live once payment_logs cascade away.
export async function deleteStripeCustomer(customerId: string | null | undefined) {
    if (!stripe || !customerId) return;
    try {
        await stripe.customers.del(customerId);
    } catch (err) {
        if ((err as { code?: string }).code !== "resource_missing") throw err; // already gone
    }
}
