import { beforeEach, describe, expect, it } from "vitest";
import * as list from "@/app/api/subscriptions/route";
import * as item from "@/app/api/subscriptions/[id]/route";
import { FREE_PLAN_LIMIT } from "@/lib/subscription-schema";
import { ctx, inDays, req, reset, run, signUp } from "./helpers";

beforeEach(reset);

const valid = { name: "Netflix", price: 12.99, dueDate: inDays(10), category: "Entertainment" };
const create = (token: string, body: object = valid) => list.POST(req("POST", { token, body }));

describe("POST /api/subscriptions", () => {
    it("401 without token", async () => {
        expect((await list.POST(req("POST", { body: valid }))).status).toBe(401);
    });

    it("creates a subscription with status active by default", async () => {
        const { token, user } = await signUp();
        const res = await create(token);
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ name: "Netflix", price: 12.99, status: "active", user_id: user.id });
    });

    it.each([
        ["missing name", { ...valid, name: undefined }],
        ["blank name", { ...valid, name: "   " }],
        ["name over 100 chars", { ...valid, name: "x".repeat(101) }],
        ["price as string", { ...valid, price: "12.99" }],
        ["zero price", { ...valid, price: 0 }],
        ["negative price", { ...valid, price: -5 }],
        ["3 decimals", { ...valid, price: 9.999 }],
        ["price too big", { ...valid, price: 1_000_000 }],
        ["date not ISO", { ...valid, dueDate: "10/12/2026" }],
        ["unknown category", { ...valid, category: "Gaming" }],
        ["unknown status", { ...valid, status: "paused" }],
        ["description over 500 chars", { ...valid, description: "x".repeat(501) }],
    ])("400 on %s", async (_, body) => {
        const { token } = await signUp();
        const res = await create(token, body);
        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe("Invalid subscription");
    });

    it("400 on a body that is not JSON", async () => {
        const { token } = await signUp();
        const res = await list.POST(
            new Request("http://test/", { method: "POST", headers: { cookie: token }, body: "{oops" })
        );
        expect(res.status).toBe(400);
    });

    it(`free plan stops at ${FREE_PLAN_LIMIT}`, async () => {
        const { token } = await signUp();
        for (let i = 0; i < FREE_PLAN_LIMIT; i++) expect((await create(token)).status).toBe(201);
        const res = await create(token);
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe("FREE_PLAN_LIMIT");
    });

    it("active premium has no limit; expired premium does", async () => {
        const { token, user } = await signUp();
        await run(`UPDATE "user" SET plan = 'premium', "premiumUntil" = ? WHERE id = ?`, [inDays(10), user.id]);
        for (let i = 0; i <= FREE_PLAN_LIMIT; i++) expect((await create(token)).status).toBe(201);

        await run(`UPDATE "user" SET "premiumUntil" = ? WHERE id = ?`, [inDays(-1), user.id]);
        expect((await create(token)).status).toBe(403);
    });
});

describe("GET /api/subscriptions", () => {
    it("lists only my subscriptions, ordered by due date", async () => {
        const me = await signUp();
        const other = await signUp();
        await create(me.token, { ...valid, name: "Later", dueDate: inDays(20) });
        await create(me.token, { ...valid, name: "Sooner", dueDate: inDays(2) });
        await create(other.token, { ...valid, name: "Not mine" });

        const body = await (await list.GET(req("GET", { token: me.token }))).json();
        expect(body.map((s: { name: string }) => s.name)).toEqual(["Sooner", "Later"]);
    });
});

describe("/api/subscriptions/[id]", () => {
    it("GET / PUT / DELETE my own subscription", async () => {
        const { token } = await signUp();
        const { id } = await (await create(token)).json();

        expect((await (await item.GET(req("GET", { token }), ctx(id))).json()).name).toBe("Netflix");

        const updated = await item.PUT(req("PUT", { token, body: { price: 15.49, status: "cancelled" } }), ctx(id));
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ name: "Netflix", price: 15.49, status: "cancelled" });

        expect((await item.DELETE(req("DELETE", { token }), ctx(id))).status).toBe(204);
        expect((await item.GET(req("GET", { token }), ctx(id))).status).toBe(404);
    });

    it("another user cannot read, edit or delete it (404)", async () => {
        const owner = await signUp();
        const intruder = await signUp();
        const { id } = await (await create(owner.token)).json();
        const token = intruder.token;

        expect((await item.GET(req("GET", { token }), ctx(id))).status).toBe(404);
        expect((await item.PUT(req("PUT", { token, body: { name: "pwned" } }), ctx(id))).status).toBe(404);
        expect((await item.DELETE(req("DELETE", { token }), ctx(id))).status).toBe(404);
        expect((await (await item.GET(req("GET", { token: owner.token }), ctx(id))).json()).name).toBe("Netflix");
    });

    it("PUT with no known fields is a 400", async () => {
        const { token } = await signUp();
        const { id } = await (await create(token)).json();
        expect((await item.PUT(req("PUT", { token, body: { user_id: "x" } }), ctx(id))).status).toBe(400);
    });

    it.each([
        ["negative price", { price: -5 }],
        ["price as text", { price: "abc" }],
        ["unknown status", { status: "paused" }],
        ["blank name", { name: "" }],
    ])("PUT rejects %s with 400 (same rules as create)", async (_, body) => {
        const { token } = await signUp();
        const { id } = await (await create(token)).json();
        expect((await item.PUT(req("PUT", { token, body }), ctx(id))).status).toBe(400);
    });
});
