"use client";

import { useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { useStaggerReveal } from "@/lib/gsap";

export default function NotFound() {
    const root = useRef<HTMLDivElement>(null);
    useStaggerReveal(root);

    return (
        <div ref={root} className="min-h-svh bg-paper text-ink">
            <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
                <Link
                    href="/"
                    aria-label="SubTrack home"
                    className="inline-flex w-fit rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                    <Logo />
                </Link>

                <div data-reveal className="mt-16 lg:mt-24">
                    <p className="eyebrow text-leak-deep">404 · Page not found</p>
                    <h1 className="display mt-4 text-[clamp(2.75rem,8vw,5rem)]">
                        Nothing here<span className="text-leak-deep">.</span>
                        <br />
                        Not even a renewal.
                    </h1>
                </div>

                <div
                    data-reveal
                    className="mt-6 max-w-lg space-y-2 text-lg leading-relaxed text-ink-soft"
                >
                    <p>
                        The page you were looking for doesn&apos;t exist or has
                        moved.
                    </p>
                    <p>Check the address, or head back to somewhere useful.</p>
                </div>

                <div
                    data-reveal
                    className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4"
                >
                    <Button size="lg" asChild>
                        <Link href="/dashboard">Go to Dashboard</Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <Link href="/">Back to Home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
