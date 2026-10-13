import { headers } from "next/headers";
import { auth } from "./better-auth";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user } from "./schema";

// The full "user" row (plan, premiumUntil, stripeCustomerId, ...) behind the session cookie, or null.
async function userFrom(h: Headers) {
    const session = await auth.api.getSession({ headers: h });
    if (!session) return null;
    const [row] = await db.select().from(user).where(eq(user.id, session.user.id));
    return row ?? null;
}

export const getUser = (req: Request) => userFrom(req.headers);

// For server components, which have no Request.
export const currentUser = async () => userFrom(await headers());

// Also expires the session cookie (both names better-auth uses: plain, and __Secure- over https),
// so a stale cookie can't bounce the user between the proxy and the sign-in page.
export function clearSessionCookies() {
    const h = new Headers();
    h.append("Set-Cookie", "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    h.append("Set-Cookie", "__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    return h;
}

export const unauthorized = () =>
    Response.json({ error: "Invalid or expired session" }, { status: 401, headers: clearSessionCookies() });

// First hop of x-forwarded-for is the client on Vercel (the platform overwrites the header).
export const clientIp = (req: Request) =>
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

export const tooManyRequests = () =>
    Response.json({ error: "Too many attempts, try again later", message: "Too many attempts, try again later" }, { status: 429 });

// Admins are listed by email in ADMIN_EMAILS (comma-separated, case-insensitive); no role column needed.
export const isAdmin = (user: { email?: unknown } | null) =>
    !!user &&
    (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .includes(String(user.email).toLowerCase());

export const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });

// ponytail: admin actions go to the Vercel logs only; add an admin_actions table if they need to be browsable.
export const logAdmin = (admin: { email?: unknown }, action: string, target?: string) =>
    console.info(JSON.stringify({ adminAction: action, admin: admin.email, target, at: new Date().toISOString() }));
