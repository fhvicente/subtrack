import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as profile from "@/app/api/users/profile/route";
import * as settings from "@/app/api/notifications/settings/route";
import * as notifTest from "@/app/api/notifications/test/route";
import * as exportData from "@/app/api/users/export/route";
import * as subs from "@/app/api/subscriptions/route";
import * as cron from "@/app/api/cron/renewals/route";
import { get, run } from "@/server/db";
import { stripe } from "@/server/stripe";
import { req, reset, signUp } from "./helpers";

beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

describe("/api/users/profile", () => {
    it("401 without token", async () => {
        expect((await profile.GET(req("GET"))).status).toBe(401);
        expect((await profile.PUT(req("PUT", { body: { name: "X" } }))).status).toBe(401);
    });

    it("GET returns the profile without password", async () => {
        const { token, email } = await signUp();
        const body = await (await profile.GET(req("GET", { token }))).json();
        expect(body).toMatchObject({ email, name: "Ana", plan: "free" });
        expect(body.password).toBeUndefined();
    });

    it("tells the client whether the user is an admin (ADMIN_EMAILS, case-insensitive)", async () => {
        vi.stubEnv("ADMIN_EMAILS", " other@test.dev , Boss@Test.dev");
        try {
            const boss = await signUp("boss@test.dev");
            const ana = await signUp("ana@test.dev");
            expect((await (await profile.GET(req("GET", { token: boss.token }))).json()).isAdmin).toBe(true);
            expect((await (await profile.GET(req("GET", { token: ana.token }))).json()).isAdmin).toBe(false);
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("PUT updates the name", async () => {
        const { token } = await signUp();
        const res = await profile.PUT(req("PUT", { token, body: { name: "Beatriz" } }));
        expect(res.status).toBe(200);
        expect((await res.json()).name).toBe("Beatriz");
    });

    it("PUT ignores fields other than name (no plan escalation)", async () => {
        const { token } = await signUp();
        const res = await profile.PUT(req("PUT", { token, body: { name: "Ana", plan: "premium", email: "x@y.z" } }));
        expect(await res.json()).toMatchObject({ plan: "free", name: "Ana" });
    });

    it("PUT without a name is a 400, not a crash", async () => {
        const { token } = await signUp();
        const res = await profile.PUT(req("PUT", { token, body: {} }));
        expect(res.status).toBe(400);
    });
});

describe("/api/notifications/settings", () => {
    it("GET creates defaults on first access", async () => {
        const { token } = await signUp();
        const body = await (await settings.GET(req("GET", { token }))).json();
        expect(body).toMatchObject({ email_enabled: 1, sms_enabled: 0, push_enabled: 0, days_before_renewal: 3 });
    });

    it("PUT updates only the fields sent and stores booleans as 1/0", async () => {
        const { token } = await signUp();
        const res = await settings.PUT(req("PUT", { token, body: { email_enabled: false, days_before_renewal: 7 } }));
        expect(await res.json()).toMatchObject({ email_enabled: 0, sms_enabled: 0, days_before_renewal: 7 });
    });

    it("PUT with a non-numeric days_before_renewal is a 400, not a crash", async () => {
        const { token } = await signUp();
        const res = await settings.PUT(req("PUT", { token, body: { days_before_renewal: "abc" } }));
        expect(res.status).toBe(400);
    });
});

describe("POST /api/notifications/test", () => {
    it("sends (simulated) email and simulates sms/push", async () => {
        const { token } = await signUp();
        for (const type of ["email", "sms", "push"]) {
            const res = await notifTest.POST(req("POST", { token, body: { type } }));
            expect(res.status).toBe(200);
            expect((await res.json()).success).toBe(true);
        }
    });

    it("rejects an unknown type", async () => {
        const { token } = await signUp();
        expect((await notifTest.POST(req("POST", { token, body: { type: "fax" } }))).status).toBe(400);
    });
});

describe("RGPD", () => {
    it("export (Art. 15/20) returns my data as a download, without secrets or other users' data", async () => {
        const { token, email } = await signUp();
        const other = await signUp();
        await subs.POST(req("POST", { token, body: { name: "Netflix", price: 10, dueDate: new Date().toISOString() } }));
        await subs.POST(req("POST", { token: other.token, body: { name: "Other", price: 1, dueDate: new Date().toISOString() } }));
        expect((await exportData.GET(req("GET"))).status).toBe(401);

        const res = await exportData.GET(req("GET", { token }));
        expect(res.headers.get("content-disposition")).toContain("attachment");
        const text = await res.text();
        const body = JSON.parse(text);
        expect(body.profile).toMatchObject({ email, name: "Ana" });
        expect(body.subscriptions.map((s: { name: string }) => s.name)).toEqual(["Netflix"]);
        expect(body.sessions).toHaveLength(1);
        expect(text).not.toMatch(/password|token|stripeCustomerId/i);
    });

    it("DELETE /api/users/profile (Art. 17) erases the account, its data and the Stripe customer", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        await subs.POST(req("POST", { token, body: { name: "Netflix", price: 10, dueDate: new Date().toISOString() } }));
        const del = vi.spyOn(stripe!.customers, "del").mockResolvedValue({} as never);

        const res = await profile.DELETE(req("DELETE", { token }));
        expect(res.status).toBe(200);
        expect(del).toHaveBeenCalledWith("cus_1");
        expect(res.headers.getSetCookie().join()).toContain("Max-Age=0");
        expect(await get(`SELECT id FROM "user" WHERE id = ?`, [user.id])).toBeUndefined();
        expect(await get(`SELECT id FROM subscriptions WHERE user_id = ?`, [user.id])).toBeUndefined();
        expect(await get(`SELECT id FROM session WHERE "userId" = ?`, [user.id])).toBeUndefined();
        expect((await profile.GET(req("GET", { token }))).status).toBe(401);
    });

    it("keeps the account when Stripe fails, so nobody is billed without an account to cancel", async () => {
        const { user, token } = await signUp();
        await run(`UPDATE "user" SET "stripeCustomerId" = 'cus_1' WHERE id = ?`, [user.id]);
        vi.spyOn(stripe!.customers, "del").mockRejectedValue(new Error("stripe down"));
        await expect(profile.DELETE(req("DELETE", { token }))).rejects.toThrow();
        expect(await get(`SELECT id FROM "user" WHERE id = ?`, [user.id])).toBeDefined();
    });

    it("settings no longer store a phone number (Art. 5(1)(c))", async () => {
        const { token } = await signUp();
        const res = await settings.PUT(req("PUT", { token, body: { phone_number: "+351 912 345 678" } }));
        expect((await res.json()).phone_number ?? null).toBeNull();
    });

    it("the daily cron prunes expired sessions (Art. 5(1)(e))", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const { user } = await signUp();
        await run(`UPDATE session SET "expiresAt" = now() - interval '1 day' WHERE "userId" = ?`, [user.id]);
        await cron.GET(new Request("http://test/", { headers: { authorization: "Bearer cron-secret" } }));
        expect(await get(`SELECT id FROM session WHERE "userId" = ?`, [user.id])).toBeUndefined();
    });
});
