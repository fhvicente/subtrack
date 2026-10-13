"use client";

import {
    useState,
    useEffect,
    FormEvent,
    ChangeEvent,
    useCallback,
    useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { usePayment } from "@/hooks/usePayment";
import { useStaggerReveal } from "@/lib/gsap";
import { useDialog } from "@/components/DialogProvider";

const FIELD =
    "flex h-11 w-full min-w-0 rounded-md border-[1.5px] border-input bg-card px-3.5 text-base text-ink transition-[border-color,box-shadow] outline-none hover:border-ink/40 focus-visible:border-ink focus-visible:ring-4 focus-visible:ring-acid disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
const SECTION = "grid gap-6 border-t border-ink/10 py-10 md:grid-cols-[14rem_1fr] md:gap-10";
const H2 = "font-wide text-xl font-extrabold tracking-[-0.03em] text-ink";
const CHECKBOX = "mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Saved() {
    return (
        <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full bg-acid px-2.5 py-0.5 text-xs font-bold text-ink"
        >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Saved
        </span>
    );
}

// Interfaces for typing
interface NotificationSettings {
    id?: string;
    user_id?: string;
    email_enabled: number;
    sms_enabled: number;
    push_enabled: number;
    days_before_renewal: number;
    created_at?: string;
    updated_at?: string;
}

interface UserProfile {
    id: string;
    email: string;
    name: string;
    plan: string;
    premiumUntil?: string;
    created_at?: string;
    updated_at?: string;
}

interface SubscriptionStatus {
    plan: string;
    premiumUntil?: string;
    isActive: boolean;
}

export default function SettingsPage() {
    const { alert, confirm } = useDialog();
    const router = useRouter();
    const { getSubscriptionStatus, cancelSubscription } = usePayment();
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [showSuccessProfile, setShowSuccessProfile] = useState(false);
    const [showSuccessNotifications, setShowSuccessNotifications] =
        useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [subscriptionStatus, setSubscriptionStatus] =
        useState<SubscriptionStatus | null>(null);
    const [notificationSettings, setNotificationSettings] =
        useState<NotificationSettings | null>(null);
    const [error, setError] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useStaggerReveal(rootRef, [isLoading, error]);

    // Form states
    const [profileForm, setProfileForm] = useState({
        name: "",
    });

    const [notificationsForm, setNotificationsForm] = useState({
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: false,
        daysBeforeRenewal: 3,
    });

    // Fetch subscription status
    const fetchSubscriptionStatus = useCallback(async () => {
        try {
            const status = await getSubscriptionStatus();
            setSubscriptionStatus(status);
            return status;
        } catch (error) {
            console.error("Error fetching subscription status:", error);
            return null;
        }
    }, [getSubscriptionStatus]);

    // Force an update when component mounts and every 30 seconds
    useEffect(() => {
        fetchSubscriptionStatus();

        // Check user settings periodically
        const intervalId = setInterval(fetchSubscriptionStatus, 30000);

        return () => clearInterval(intervalId);
    }, [fetchSubscriptionStatus]);

    // Fetch user data and notification settings
    const fetchUserData = useCallback(async () => {
        try {
            setIsLoading(true);
            setError("");

            // Fetch user profile
            const userResponse = await api.get("/users/profile");
            const userData = userResponse.data;
            setUser(userData);
            setProfileForm({
                name: userData.name,
            });

            // Fetch subscription status
            await fetchSubscriptionStatus();

            // Fetch notification settings
            try {
                const notificationsResponse = await api.get(
                    "/notifications/settings"
                );
                const notificationsData = notificationsResponse.data;
                setNotificationSettings(notificationsData);

                // Set up notification form state
                setNotificationsForm({
                    emailEnabled: notificationsData.email_enabled === 1,
                    smsEnabled: notificationsData.sms_enabled === 1,
                    pushEnabled: notificationsData.push_enabled === 1,
                    daysBeforeRenewal: notificationsData.days_before_renewal,
                });
            } catch (notifError) {
                console.error(
                    "Error fetching notification settings:",
                    notifError
                );
                // If we can't fetch settings, keep the default values
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            setError("Unable to load your settings. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    }, [fetchSubscriptionStatus]);

    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    // Handlers for form changes
    const handleProfileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleNotificationChange = (
        e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { id, name, value, type } = e.target;
        const fieldName = id || name;

        if (type === "checkbox") {
            const checkbox = e.target as HTMLInputElement;
            setNotificationsForm((prev) => ({
                ...prev,
                [fieldName]: checkbox.checked,
            }));
        } else {
            setNotificationsForm((prev) => ({
                ...prev,
                [fieldName]: value,
            }));
        }
    };

    // Handlers for form submissions
    const handleProfileSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
            setIsSavingProfile(true);

            await api.put("/users/profile", {
                name: profileForm.name,
            });

            // Show success message
            setShowSuccessProfile(true);
            setTimeout(() => setShowSuccessProfile(false), 3000);

            // Update user state
            if (user) {
                setUser({
                    ...user,
                    name: profileForm.name,
                });
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Unable to update profile. Please try again later.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleNotificationsSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
            setIsSavingNotifications(true);

            const payload = {
                email_enabled: notificationsForm.emailEnabled ? 1 : 0,
                sms_enabled: notificationsForm.smsEnabled ? 1 : 0,
                push_enabled: notificationsForm.pushEnabled ? 1 : 0,
                days_before_renewal: parseInt(
                    notificationsForm.daysBeforeRenewal.toString()
                ),
            };

            await api.put("/notifications/settings", payload);

            // Show success message
            setShowSuccessNotifications(true);
            setTimeout(() => setShowSuccessNotifications(false), 3000);

            // Update notification settings state
            if (notificationSettings) {
                setNotificationSettings({
                    ...notificationSettings,
                    email_enabled: payload.email_enabled,
                    sms_enabled: payload.sms_enabled,
                    push_enabled: payload.push_enabled,
                    days_before_renewal: payload.days_before_renewal,
                });
            }
        } catch (error) {
            console.error("Error updating notification settings:", error);
            alert(
                "Unable to update notification settings. Please try again later."
            );
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleDeleteAccount = async () => {
        const ok = await confirm(
            "Your subscriptions, settings and payment history are erased and any Premium plan stops billing right away. This can't be undone.",
            { title: "Delete your account?", confirmLabel: "Delete account", destructive: true }
        );
        if (!ok) return;
        try {
            await api.delete("/users/profile");
            // Full reload so every client-side auth state starts from scratch.
            window.location.href = "/";
        } catch (error) {
            console.error("Error deleting account:", error);
            alert("Unable to delete your account. Please try again later.");
        }
    };

    if (isLoading) {
        return (
            <div ref={rootRef} className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-ink" aria-label="Loading settings" />
            </div>
        );
    }

    if (error) {
        return (
            <div ref={rootRef} className="max-w-xl space-y-6">
                <div role="alert" className="rounded-xl border-[1.5px] border-leak-deep bg-leak-deep/5 p-6">
                    <p className="font-semibold text-leak-deep">Error: {error}</p>
                </div>
                <Button onClick={() => router.refresh()}>Try again</Button>
            </div>
        );
    }

    const isPremium = subscriptionStatus?.plan === "premium";

    return (
        <div ref={rootRef}>
            <header data-reveal className="pb-10">
                <p className="eyebrow text-ink-soft">Account</p>
                <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)] text-ink">
                    Settings
                </h1>
            </header>

            {/* Profile Settings */}
            <section data-reveal aria-labelledby="profile-heading" className={SECTION}>
                <div>
                    <h2 id="profile-heading" className={H2}>Profile</h2>
                    <p className="mt-2 text-sm text-ink-soft">What we call you.</p>
                </div>
                <form className="max-w-xl space-y-6" onSubmit={handleProfileSubmit}>
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            name="name"
                            value={profileForm.name}
                            onChange={handleProfileChange}
                            autoComplete="name"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            value={user?.email || ""}
                            aria-describedby="email-hint"
                            disabled
                        />
                        <p id="email-hint" className="text-sm text-ink-soft">
                            Managed by your login account.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button type="submit" disabled={isSavingProfile}>
                            {isSavingProfile ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Saving...
                                </>
                            ) : (
                                "Save changes"
                            )}
                        </Button>
                        {showSuccessProfile && <Saved />}
                    </div>
                </form>
            </section>

            {/* Notification Settings */}
            <section data-reveal aria-labelledby="notifications-heading" className={SECTION}>
                <div>
                    <h2 id="notifications-heading" className={H2}>Reminders</h2>
                    <p className="mt-2 text-sm text-ink-soft">
                        A heads-up before anything charges you.
                    </p>
                </div>
                <form className="max-w-xl space-y-6" onSubmit={handleNotificationsSubmit}>
                    <ul className="divide-y divide-ink/10 border-y border-ink/10">
                        <li className="flex items-start gap-3 py-4">
                            <input
                                type="checkbox"
                                id="emailEnabled"
                                aria-describedby="emailEnabled-hint"
                                className={CHECKBOX}
                                checked={notificationsForm.emailEnabled}
                                onChange={handleNotificationChange}
                            />
                            <div>
                                <label htmlFor="emailEnabled" className="cursor-pointer font-semibold text-ink">
                                    Email reminders
                                </label>
                                <p id="emailEnabled-hint" className="text-sm text-ink-soft">
                                    Get an email before each renewal.
                                </p>
                            </div>
                        </li>
                    </ul>

                    <div className="space-y-2">
                        <Label htmlFor="daysBeforeRenewal">Remind me</Label>
                        <select
                            id="daysBeforeRenewal"
                            className={FIELD}
                            value={notificationsForm.daysBeforeRenewal}
                            onChange={handleNotificationChange}
                        >
                            <option value="1">1 day before</option>
                            <option value="2">2 days before</option>
                            <option value="3">3 days before</option>
                            <option value="5">5 days before</option>
                            <option value="7">7 days before</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button type="submit" disabled={isSavingNotifications}>
                            {isSavingNotifications ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Saving...
                                </>
                            ) : (
                                "Save reminders"
                            )}
                        </Button>
                        {showSuccessNotifications && <Saved />}
                    </div>
                </form>
            </section>

            {/* Subscription Plan */}
            <section data-reveal aria-labelledby="plan-heading" className={SECTION}>
                <div>
                    <h2 id="plan-heading" className={H2}>Plan</h2>
                    <p className="mt-2 text-sm text-ink-soft">What you pay us.</p>
                </div>
                <div className="max-w-xl space-y-6">
                    <div className={`rounded-xl p-6 sm:p-8 ${isPremium ? "bg-acid text-ink" : "bg-ink text-paper"}`}>
                        <p className={`eyebrow ${isPremium ? "" : "text-paper/70"}`}>Current plan</p>
                        <p className="display mt-4 text-5xl">{isPremium ? "Premium" : "Free"}</p>
                        {isPremium && subscriptionStatus?.premiumUntil && (
                            <p className="mt-4 text-sm font-semibold">
                                Valid until{" "}
                                <span className="tabular-nums">
                                    {new Date(subscriptionStatus.premiumUntil).toLocaleDateString()}
                                </span>
                            </p>
                        )}
                        <p className={`mt-3 text-sm ${isPremium ? "" : "text-paper/70"}`}>
                            {isPremium
                                ? "You have every premium feature."
                                : "Up to 3 subscriptions. Go Premium for unlimited."}
                        </p>
                        {!isPremium && (
                            <Button asChild variant="acid" className="mt-6">
                                <a href="/payment">Upgrade to Premium</a>
                            </Button>
                        )}
                    </div>

                    {isPremium && (
                        <div className="space-y-3 border-t border-ink/10 pt-6">
                            <p className="text-sm text-ink-soft">
                                Cancel any time. You keep Premium until the end of the period you paid for.
                            </p>
                            <Button
                                variant="destructive"
                                onClick={async () => {
                                    if (
                                        await confirm(
                                            "You keep Premium until the end of the period you paid for.",
                                            { title: "Cancel your Premium plan?", confirmLabel: "Cancel plan", destructive: true }
                                        )
                                    ) {
                                        try {
                                            await cancelSubscription();
                                            await alert(
                                                "Your plan has been cancelled.",
                                                { title: "Done" }
                                            );
                                            // Update subscription status after cancellation
                                            await fetchSubscriptionStatus();
                                            router.refresh();
                                        } catch (error) {
                                            console.error(
                                                "Error canceling subscription:",
                                                error
                                            );
                                            alert(
                                                "Unable to cancel your subscription. Please try again later."
                                            );
                                        }
                                    }
                                }}
                            >
                                Cancel plan
                            </Button>
                        </div>
                    )}
                </div>
            </section>

            {/* Your data (RGPD Art. 15, 17, 20) */}
            <section data-reveal aria-labelledby="data-heading" className={SECTION}>
                <div>
                    <h2 id="data-heading" className={H2}>Your data</h2>
                    <p className="mt-2 text-sm text-ink-soft">
                        Take it with you, or take it away. See the{" "}
                        <a href="/privacy" className="underline underline-offset-4">privacy policy</a>.
                    </p>
                </div>
                <div className="max-w-xl space-y-8">
                    <div className="space-y-3">
                        <p className="text-sm text-ink-soft">
                            Everything we hold about you, as a JSON file.
                        </p>
                        <Button asChild variant="outline">
                            <a href="/api/users/export" download>Download my data</a>
                        </Button>
                    </div>
                    <div className="space-y-3 border-t border-ink/10 pt-6">
                        <p className="text-sm text-ink-soft">
                            Deletes your account and everything in it. A Premium plan is cancelled immediately.
                        </p>
                        <Button variant="destructive" onClick={handleDeleteAccount}>
                            Delete account
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
