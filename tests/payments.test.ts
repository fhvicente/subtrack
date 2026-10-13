import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import * as session from "@/app/api/payments/session/route";
import * as webhook from "@/app/api/payments/webhook/route";
import * as status from "@/app/api/payments/status/route";
import * as sessionStatus from "@/app/api/payments/status/session/route";
import * as history from "@/app/api/payments/history/route";
import * as cancel from "@/app/api/payments/cancel-subscription/route";
import * as cron from "@/app/api/cron/renewals/route";
import * as subs from "@/app/api/subscriptions/route";
import { stripe as maybeStripe } from "@/server/stripe";
import { get, inDays, req, reset, run, signUp } from "./helpers";

const stripe = maybeStripe!;

beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

// A webhook request signed like Stripe would, with the test secret.
function stripeEvent(type: string, object: object) {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    return new Request("http://test/", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}

const completeCheckout = (userId: string, id = "cs_test_1") =>
    webhook.POST(stripeEvent("checkout.session.completed", { id, amount_total: 999, payment_status: "paid", metadata: { userId, plan: "monthly" } }));

describe("POST /api/payments/session", () => {
    it("401 without token", async () => {
        expect((await session.POST(req("POST", { body: { plan: "monthly" } }))).status).toBe(401);
    });

    it("rejects any plan other than monthly", async () => {
        const { token } = await signUp();
        expect((await session.POST(req("POST", { token, body: { plan: "lifetime" } }))).status).toBe(400);
    });

    it("creates the Stripe customer once and a checkout session for the monthly price", async () => {
        const { token, user } = await signUp();
        const createCustomer = vi.spyOn(stripe.customers, "create").mockResolvedValue({ id: "cus_1" } as never);
        const createSession = vi
            .spyOn(stripe.checkout.sessions, "create")
            .mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" } as never);

        for (let i = 0; i < 2; i++) {
            const res = await session.POST(req("POST", { token, body: { plan: "monthly" } }));
            expect(await res.json()).toEqual({ sessionId: "cs_1", url: "https://checkout.stripe.com/x" });
        }

        expect(createCustomer).toHaveBeenCalledTimes(1);
        expect((await get(`SELECT "stripeCustomerId" FROM "user" WHERE id = ?`, [user.id]))!.stripeCustomerId).toBe("cus_1");
        const params = createSession.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
        expect(params).toMatchObject({
            customer: "cus_1",
            mode: "subscription",
            line_items: [{ price: "price_test", quantity: 1 }],
            metadata: { userId: user.id, plan: "monthly" },
        });
    });
});

describe("POST /api/payments/webhook", () => {
    it("rejects an unsigned or tampered event", async () => {
        const { user } = await signUp();
        const forged = new Request("http://test/", {
            method: "POST",
            headers: { "stripe-signature": "t=1,v1=deadbeef" },
            body: JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { userId: user.id } } } }),
        });
        expect((await webhook.POST(forged)).status).toBe(400);
        expect((await get(`SELECT plan FROM "user" WHERE id = ?`, [user.id]))!.plan).toBe("free");
    });

    it("checkout.session.completed makes the user premium for ~30 days and logs the payment", async () => {
        const { user, token } = await signUp();
        expect((await completeCheckout(user.id)).status).toBe(200);

        const s = await (await status.GET(req("GET", { token }))).json();
        expect(s).toMatchObject({ plan: "premium", isActive: true });
        const days = (new Date(s.premiumUntil).getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThan(30.1);

        const logs = await (await history.GET(req("GET", { token }))).json();
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ amount: 9.99, status: "success", stripeSessionId: "cs_test_1", plan: "monthly" });
    });

    it("premium unlocks more than the free limit", async () => {
        const { user, token } = await signUp();
        await completeCheckout(user.id);
        for (let i = 0; i < 4; i++) {
            const res = await subs.POST(req("POST", { token, body: { name: `S${i}`, price: 1, dueDate: inDays(5) } }));
            expect(res.status).toBe(201);
        }
    });

    it("ignores a checkout session that isn't paid", async () => {
        const { user } = await signUp();
        await webhook.POST(stripeEvent("checkout.session.completed", { id: "cs_unpaid", payment_status: "unpaid", metadata: { userId: user.id } }));
        expect((await get(`SELECT plan FROM "user" WHERE id = ?`, [user.id]))!.plan).toBe("free");
    });

    it("invoice.paid extends premium to the end of the billed period (renewals)", async () => {
        const { user } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        const end = Math.floor(Date.now() / 1000) + 60 * 86_400;
        const res = await webhook.POST(
            stripeEvent("invoice.paid", { id: "in_1", customer: "cus_1", lines: { data: [{ period: { start: 0, end } }] } })
        );
        expect(res.status).toBe(200);
        const row = (await get(`SELECT plan, "premiumUntil" FROM "user" WHERE id = ?`, [user.id]))!;
        expect(row.plan).toBe("premium");
        expect(new Date(row.premiumUntil).getTime()).toBe(end * 1000);
    });

    it("invoice.payment_failed logs a failed payment for the customer", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        await webhook.POST(stripeEvent("invoice.payment_failed", { id: "in_1", customer: "cus_1", amount_due: 999 }));
        const logs = await (await history.GET(req("GET", { token }))).json();
        expect(logs[0]).toMatchObject({ status: "failed", amount: 9.99 });
    });

    it("customer.subscription.deleted downgrades the user", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        await completeCheckout(user.id);
        await webhook.POST(stripeEvent("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }));
        expect(await (await status.GET(req("GET", { token }))).json()).toMatchObject({
            plan: "free",
            premiumUntil: null,
            isActive: false,
        });
    });
});

describe("GET /api/payments/status/session", () => {
    it("401 without token, 400 without session_id, 404 for an unknown one", async () => {
        const { token } = await signUp();
        expect((await sessionStatus.GET(req("GET", { url: "http://test/?session_id=cs_nope" }))).status).toBe(401);
        expect((await sessionStatus.GET(req("GET", { token }))).status).toBe(400);
        expect((await sessionStatus.GET(req("GET", { token, url: "http://test/?session_id=cs_nope" }))).status).toBe(404);
    });

    it("reports a verified premium session to its owner only, without the email", async () => {
        const { user, token } = await signUp();
        const other = await signUp();
        await completeCheckout(user.id, "cs_ok");
        const url = "http://test/?session_id=cs_ok";
        const body = await (await sessionStatus.GET(req("GET", { token, url }))).json();
        expect(body).toMatchObject({ plan: "premium", isActive: true, verifiedSession: true });
        expect(body.email).toBeUndefined();
        expect((await sessionStatus.GET(req("GET", { token: other.token, url }))).status).toBe(404);
    });
});

describe("POST /api/payments/cancel-subscription", () => {
    it("cancels active Stripe subscriptions, downgrades and logs it", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        await completeCheckout(user.id);
        vi.spyOn(stripe.subscriptions, "list").mockResolvedValue({ data: [{ id: "sub_1" }] } as never);
        const cancelSub = vi.spyOn(stripe.subscriptions, "cancel").mockResolvedValue({} as never);

        expect((await cancel.POST(req("POST", { token }))).status).toBe(200);
        expect(cancelSub).toHaveBeenCalledWith("sub_1");
        expect(await (await status.GET(req("GET", { token }))).json()).toMatchObject({ plan: "free", isActive: false });
        const logs = await (await history.GET(req("GET", { token }))).json();
        expect(logs.map((l: { status: string }) => l.status)).toContain("canceled");
    });

    it("keeps premium and answers 502 when Stripe fails, so the user isn't billed for a free plan", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        await completeCheckout(user.id);
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(stripe.subscriptions, "list").mockRejectedValue(new Error("stripe down"));

        expect((await cancel.POST(req("POST", { token }))).status).toBe(502);
        expect((await (await status.GET(req("GET", { token }))).json()).plan).toBe("premium");
    });
});

describe("GET /api/payments/history", () => {
    it("only shows my own payments", async () => {
        const me = await signUp();
        const other = await signUp();
        await completeCheckout(other.user.id);
        expect(await (await history.GET(req("GET", { token: me.token }))).json()).toEqual([]);
    });
});

describe("GET /api/cron/renewals", () => {
    it("401 without the cron secret", async () => {
        expect((await cron.GET(req("GET"))).status).toBe(401);
        expect((await cron.GET(req("GET", { token: "wrong" }))).status).toBe(401);
    });

    it("emails only active subscriptions due in days_before_renewal days", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const { token } = await signUp();
        const due = inDays(2.5); // ceil(2.5) = 3 = default days_before_renewal
        await subs.POST(req("POST", { token, body: { name: "Due", price: 1, dueDate: due } }));
        await subs.POST(req("POST", { token, body: { name: "Later", price: 1, dueDate: inDays(10) } }));
        await subs.POST(req("POST", { token, body: { name: "Off", price: 1, dueDate: due, status: "inactive" } }));
        // settings row is created lazily; the cron only sees users that have one
        await (await import("@/app/api/notifications/settings/route")).GET(req("GET", { token }));

        const res = await cron.GET(new Request("http://test/", { headers: { authorization: "Bearer cron-secret" } }));
        expect(await res.json()).toEqual({ sent: 1 });
    });
});
