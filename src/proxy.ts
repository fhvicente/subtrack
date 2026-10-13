import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
    // Presence check only (handles the __Secure- prefix too); API routes validate the session.
    const token = getSessionCookie(request);
    const { pathname } = request.nextUrl;
    const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

    // Protected route without a session: redirect to sign-in
    if (!token && !isAuthPage) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // If user is authenticated and trying to access auth pages, redirect to dashboard
    if (token && isAuthPage) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Only protected routes and auth pages; everything else (incl. unknown URLs → 404) skips the proxy.
    // ponytail: new protected sections under app/(protected) must be added here
    matcher: [
        "/dashboard/:path*",
        "/subscriptions/:path*",
        "/settings/:path*",
        "/admin/:path*",
        "/sign-in",
        "/sign-up",
    ],
};
