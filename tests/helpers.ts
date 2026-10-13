import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { auth } from "@/server/better-auth";

// Raw SQL for test setup and assertions, so they check the database itself rather than the app's queries.
const raw = (text: string, params: unknown[] = []) => {
    let n = 0;
    return db.$client.query(text.replace(/\?/g, () => `$${++n}`), params);
};
export const run = (text: string, params?: unknown[]) => raw(text, params);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const get = async (text: string, params?: unknown[]): Promise<any> => (await raw(text, params)).rows[0];

export const reset = () =>
    run(
        `TRUNCATE "user", subscriptions, notification_settings, payment_logs, rate_limits,
                  session, account, verification, "rateLimit" CASCADE`
    );

// `token` is the session cookie pair (`better-auth.session_token=...`), sent as-is.
export function req(method: string, { body, token, url = "http://test/" }: { body?: unknown; token?: string; url?: string } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.cookie = token;
    return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

// The `name=value` of the session cookie a better-auth response sets.
export const sessionCookie = (res: Response) =>
    res.headers.getSetCookie().find((c) => /^(__Secure-)?better-auth\.session_token=/.test(c))?.split(";")[0] ?? "";

// A request to a better-auth endpoint the way the browser sends it: same-origin Origin header and a client IP.
export function authReq(path: string, { body, token }: { body?: unknown; token?: string } = {}) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": "203.0.113.7",
    };
    if (token) headers.cookie = token;
    return new Request(`http://localhost:3000/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// Calls better-auth directly (no HTTP, so no per-IP limit) and returns the "user" row in the API's shape.
export async function signUp(email = `${randomUUID()}@test.dev`) {
    const res = await auth.api.signUpEmail({ body: { name: "Ana", email, password: "secret123" }, asResponse: true });
    const { user: created } = await res.json();
    const user = await get(
        `SELECT id, email, name, plan, "createdAt" AS created_at, "updatedAt" AS updated_at FROM "user" WHERE id = ?`,
        [created.id]
    );
    return { user: user!, token: sessionCookie(res), email };
}

export const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
