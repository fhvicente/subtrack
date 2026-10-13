import { beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "@/app/api/admin/route";
import * as adminUser from "@/app/api/admin/users/[id]/route";
import * as renewals from "@/app/api/admin/renewals/route";
import { stripe } from "@/server/stripe";
import { ctx, get, inDays, req, reset, run, signUp } from "./helpers";

beforeEach(async () => {
    await reset();
    vi.stubEnv("ADMIN_EMAILS", "boss@test.dev");
});

describe("/api/admin", () => {
    it("401 without a session, 403 for non-admins", async () => {
        const { token, user } = await signUp();
        expect((await admin.GET(req("GET"))).status).toBe(401);
        expect((await admin.GET(req("GET", { token }))).status).toBe(403);
        expect((await adminUser.PATCH(req("PATCH", { token, body: { plan: "premium" } }), ctx(user.id))).status).toBe(403);
        expect((await adminUser.DELETE(req("DELETE", { token }), ctx(user.id))).status).toBe(403);
    });

    it("returns KPIs and searchable users", async () => {
        const { token } = await signUp("boss@test.dev");
        const { user } = await signUp("ana@test.dev");
        await run(`UPDATE "user" SET plan = 'premium', "premiumUntil" = now() + interval '1 day' WHERE id = ?`, [user.id]);
        await run(`INSERT INTO subscriptions (id, user_id, name, due_date, price, category) VALUES ('s1', ?, 'Netflix', now(), 10, 'Streaming')`, [user.id]);
        await run(`INSERT INTO payment_logs (id, user_id, amount, status) VALUES ('p1', ?, 4.99, 'success'), ('p2', ?, 4.99, 'failed')`, [user.id, user.id]);

        const body = await (await admin.GET(req("GET", { token }))).json();
        expect(body.kpis).toMatchObject({
            users: 2, newUsers30: 2, premiumUsers: 1, conversion: 0.5,
            revenue30: 4.99, failedPayments30: 1, subscriptions: 1, activationRate: 0.5, trackedMonthlyValue: 10,
        });
        expect(body.categories).toEqual([{ name: "Streaming", count: 1 }]);
        expect(body.recentPayments).toHaveLength(2);

        const found = await (await admin.GET(req("GET", { token, url: "http://test/?q=ANA@" }))).json();
        expect(found.users.map((u: { email: string }) => u.email)).toEqual(["ana@test.dev"]);
        expect(found.users[0]).toMatchObject({ subscriptions: 1 });
        expect(found.users[0].password).toBeUndefined();
    });

    it("PATCH grants and removes premium", async () => {
        const { token } = await signUp("boss@test.dev");
        const { user } = await signUp();
        const res = await adminUser.PATCH(req("PATCH", { token, body: { plan: "premium" } }), ctx(user.id));
        expect(res.status).toBe(200);
        const row = await get(`SELECT plan, "premiumUntil" FROM "user" WHERE id = ?`, [user.id]);
        expect(row!.plan).toBe("premium");
        expect(new Date(row!.premiumUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

        await adminUser.PATCH(req("PATCH", { token, body: { plan: "free" } }), ctx(user.id));
        expect(await get(`SELECT plan, "premiumUntil" FROM "user" WHERE id = ?`, [user.id])).toEqual({ plan: "free", premiumUntil: null });

        expect((await adminUser.PATCH(req("PATCH", { token, body: { plan: "gold" } }), ctx(user.id))).status).toBe(400);
        expect((await adminUser.PATCH(req("PATCH", { token, body: { plan: "free" } }), ctx("nope"))).status).toBe(404);
    });

    it("DELETE removes a user (and their Stripe customer) but not the admin themself", async () => {
        const { token, user: me } = await signUp("boss@test.dev");
        const { user } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_2' WHERE id = ?`, [user.id]);
        const del = vi.spyOn(stripe!.customers, "del").mockResolvedValue({} as never);
        expect((await adminUser.DELETE(req("DELETE", { token }), ctx(me.id))).status).toBe(400);
        expect((await adminUser.DELETE(req("DELETE", { token }), ctx(user.id))).status).toBe(200);
        expect(await get(`SELECT id FROM "user" WHERE id = ?`, [user.id])).toBeUndefined();
        expect(del).toHaveBeenCalledWith("cus_2");
        del.mockRestore();
        expect((await adminUser.DELETE(req("DELETE", { token }), ctx(user.id))).status).toBe(404);
    });

    it("GET user detail shows subscriptions and payments, never the password", async () => {
        const { token } = await signUp("boss@test.dev");
        const { user, token: userToken } = await signUp();
        expect((await adminUser.GET(req("GET", { token: userToken }), ctx(user.id))).status).toBe(403);
        await run(`INSERT INTO subscriptions (id, user_id, name, due_date, price) VALUES ('s1', ?, 'Netflix', now(), 10)`, [user.id]);
        await run(`INSERT INTO payment_logs (id, user_id, amount, status) VALUES ('p1', ?, 4.99, 'failed')`, [user.id]);

        const body = await (await adminUser.GET(req("GET", { token }), ctx(user.id))).json();
        expect(body.user).toMatchObject({ id: user.id, plan: "free" });
        expect(body.user.password).toBeUndefined();
        expect(body.user.stripeCustomerId).toBeUndefined();
        expect(body.subscriptions).toMatchObject([{ name: "Netflix", price: 10 }]);
        expect(body.payments).toMatchObject([{ amount: 4.99, status: "failed" }]);
        expect((await adminUser.GET(req("GET", { token }), ctx("nope"))).status).toBe(404);
    });

    it("filters payments by status", async () => {
        const { token, user } = await signUp("boss@test.dev");
        await run(`INSERT INTO payment_logs (id, user_id, amount, status) VALUES ('p1', ?, 4.99, 'success'), ('p2', ?, 4.99, 'failed')`, [user.id, user.id]);
        const failed = await (await admin.GET(req("GET", { token, url: "http://test/?status=failed" }))).json();
        expect(failed.recentPayments.map((p: { id: string }) => p.id)).toEqual(["p2"]);
        const all = await (await admin.GET(req("GET", { token, url: "http://test/?status=bogus" }))).json();
        expect(all.recentPayments).toHaveLength(2);
    });

    it("POST renewals sends due reminders, admins only", async () => {
        const { token } = await signUp("boss@test.dev");
        const { user, token: userToken } = await signUp();
        expect((await renewals.POST(req("POST", { token: userToken }))).status).toBe(403);
        await run(`INSERT INTO notification_settings (id, user_id) VALUES ('n1', ?) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
        const days = (await get(`SELECT days_before_renewal FROM notification_settings WHERE user_id = ?`, [user.id]))!.days_before_renewal;
        await run(`INSERT INTO subscriptions (id, user_id, name, due_date, price) VALUES ('s1', ?, 'Netflix', ?, 10)`, [user.id, inDays(days - 0.5)]);

        const res = await renewals.POST(req("POST", { token }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sent: 1 });
    });
});
