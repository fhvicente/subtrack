"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStaggerReveal } from "@/lib/gsap";
import { Eye, EyeOff } from "lucide-react";

// Password input with a show/hide toggle; each instance keeps its own visibility.
function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Input {...props} type={visible ? "text" : "password"} className="pr-11" />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
            >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
        </div>
    );
}

export default function SignUpPage() {
    const router = useRouter();
    const { register, error } = useAuth();
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [isLoading, setIsLoading] = useState(false);
    const [validationError, setValidationError] = useState("");
    const root = useRef<HTMLDivElement>(null);
    useStaggerReveal(root);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));

        // Clear validation error when user types
        if (validationError) {
            setValidationError("");
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setValidationError("");

        const { email, password, confirmPassword } = formData;
        const name = formData.name.trim();

        if (name.length < 2) {
            setValidationError("Name must be at least 2 characters long");
            setIsLoading(false);
            return;
        }

        // Validate passwords match
        if (password !== confirmPassword) {
            setValidationError("Passwords do not match");
            setIsLoading(false);
            return;
        }

        // Validate password strength
        if (password.length < 8) {
            setValidationError("Password must be at least 8 characters long");
            setIsLoading(false);
            return;
        }

        try {
            const result = await register({ name, email, password });

            if (result.success) {
                router.push("/dashboard");
            }
        } catch (error) {
            console.error("Registration failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            ref={root}
            className="flex min-h-svh flex-col bg-paper text-ink lg:grid lg:grid-cols-2"
        >
            <aside className="flex flex-col justify-between gap-8 bg-acid px-5 py-6 text-ink sm:px-8 lg:min-h-svh lg:p-12">
                <Link
                    href="/"
                    aria-label="SubTrack home"
                    className="w-fit rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-acid"
                >
                    <Logo />
                </Link>
                <p
                    data-reveal
                    className="display max-w-[14ch] text-[clamp(2.25rem,9vw,3.5rem)] lg:text-[clamp(4rem,7vw,7rem)]"
                >
                    Stop paying for things you forgot.
                </p>
            </aside>

            <main className="flex flex-1 items-center px-5 py-12 sm:px-8 lg:px-16">
                <div className="w-full max-w-sm">
                    <div data-reveal className="mb-8">
                        <p className="eyebrow text-ink-soft">Create account</p>
                        <h1 className="display mt-3 text-4xl">
                            Free to start.
                        </h1>
                    </div>

                    {(error || validationError) && (
                        <div
                            role="alert"
                            className="mb-6 rounded-xl border-[1.5px] border-leak-deep bg-leak-deep/5 p-4 text-sm font-medium text-leak-deep"
                        >
                            Error: {validationError || error}
                        </div>
                    )}

                    <form
                        data-reveal
                        onSubmit={handleSubmit}
                        className="space-y-5"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                name="name"
                                type="text"
                                autoComplete="name"
                                placeholder="Jane Doe"
                                required
                                minLength={2}
                                maxLength={100}
                                value={formData.name}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                required
                                maxLength={254}
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <PasswordInput
                                id="password"
                                name="password"
                                autoComplete="new-password"
                                placeholder="●●●●●●●●"
                                required
                                minLength={8}
                                maxLength={128}
                                aria-describedby="password-hint"
                                value={formData.password}
                                onChange={handleChange}
                            />
                            <p
                                id="password-hint"
                                className="text-xs text-ink-soft"
                            >
                                8 to 128 characters.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">
                                Confirm password
                            </Label>
                            <PasswordInput
                                id="confirmPassword"
                                name="confirmPassword"
                                autoComplete="new-password"
                                placeholder="●●●●●●●●"
                                required
                                minLength={8}
                                maxLength={128}
                                value={formData.confirmPassword}
                                onChange={handleChange}
                            />
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={isLoading}
                            className="mt-3 w-full"
                        >
                            {isLoading
                                ? "Creating account..."
                                : "Create account"}
                        </Button>
                        <p className="text-xs text-ink-soft">
                            We use your details only to run your account. See our{" "}
                            <Link href="/privacy" className="underline underline-offset-4">
                                privacy policy
                            </Link>
                            .
                        </p>
                    </form>

                    <p data-reveal className="mt-8 text-sm text-ink-soft">
                        Already have an account?{" "}
                        <Button
                            asChild
                            variant="link"
                            className="h-auto text-sm"
                        >
                            <Link href="/sign-in">Sign in</Link>
                        </Button>
                    </p>
                </div>
            </main>
        </div>
    );
}
