"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { CONTROLLER } from "@/lib/legal";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SubTrack";

export default function Footer() {
    const { isAuthenticated } = useAuth();
    const links = [
        { href: "/#features", label: "Features" },
        { href: "/#how-it-works", label: "How it works" },
        { href: "/privacy", label: "Privacy" },
        ...(isAuthenticated()
            ? [{ href: "/dashboard", label: "Dashboard" }]
            : [
                  { href: "/sign-in", label: "Sign in" },
                  { href: "/sign-up", label: "Sign up" },
              ]),
    ];

    return (
        <footer className="overflow-hidden bg-ink px-5 pt-20 text-paper sm:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col gap-12 md:flex-row md:justify-between">
                    <p className="max-w-sm text-lg leading-relaxed text-paper/70">
                        Track every subscription, get warned before renewals, keep
                        the money you meant to keep.
                    </p>
                    <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
                        {links.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="font-semibold underline-offset-4 hover:text-acid hover:underline"
                            >
                                {l.label}
                            </Link>
                        ))}
                        <a
                            href={`mailto:${CONTROLLER.email}`}
                            className="font-semibold underline-offset-4 hover:text-acid hover:underline"
                        >
                            Contact
                        </a>
                    </nav>
                </div>
                <p
                    aria-hidden="true"
                    className="display mt-20 select-none whitespace-nowrap text-center text-[15vw] leading-[0.78] text-acid lg:text-[min(15vw,13.25rem)]"
                >
                    {APP_NAME}
                </p>
                <p className="border-t border-paper/15 py-6 text-sm text-paper/50">
                    © {new Date().getFullYear()} {APP_NAME}
                </p>
            </div>
        </footer>
    );
}
