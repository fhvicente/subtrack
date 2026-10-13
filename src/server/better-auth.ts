import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, rateLimited } from "./db";
import { account, rateLimit, session, user, verification } from "./schema";

const FIFTEEN_MIN = 15 * 60;

export const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification, rateLimit } }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    // Billing state lives on the user; input: false so sign-up / update-user can't set it.
    user: {
        additionalFields: {
            plan: { type: "string", defaultValue: "free", input: false },
            premiumUntil: { type: "date", required: false, input: false },
            stripeCustomerId: { type: "string", required: false, input: false },
        },
    },
    // ponytail: better-auth only trusts a single-value x-forwarded-for (fine on Vercel, which overwrites it).
    // Behind an extra proxy/CDN the header has several hops and all clients share one bucket; then set advanced.ipAddress (ipAddressHeaders / trusted proxies).
    rateLimit: {
        enabled: process.env.NODE_ENV !== "development",
        storage: "database", // shared by all serverless instances
        customRules: {
            "/sign-in/email": { window: FIFTEEN_MIN, max: 20 },
            "/sign-up/email": { window: 60 * 60, max: 5 },
        },
    },
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/sign-up/email") {
                const name = typeof ctx.body?.name === "string" ? ctx.body.name.trim() : "";
                if (!name || name.length > 100) {
                    throw new APIError("BAD_REQUEST", { message: "Name must be 1 to 100 characters" });
                }
            }
            // better-auth limits per IP only; this stops credential stuffing spread over many IPs.
            if (ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string") {
                if (await rateLimited(`login:email:${ctx.body.email.toLowerCase()}`, 10, FIFTEEN_MIN)) {
                    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts, try again later" });
                }
            }
        }),
    },
});
