"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import Link from "next/link";
import { api } from "@/lib/auth";
import { useRouter, useParams } from "next/navigation";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { useStaggerReveal } from "@/lib/gsap";
import { useDialog } from "@/components/DialogProvider";

const FIELD =
    "flex w-full min-w-0 rounded-md border-[1.5px] border-input bg-card px-3.5 text-base text-ink transition-[border-color,box-shadow] outline-none hover:border-ink/40 placeholder:text-muted-foreground focus-visible:border-ink focus-visible:ring-4 focus-visible:ring-acid disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
import { ChangeEvent, FormEvent } from "react";

interface Subscription {
    id: string;
    name: string;
    price: number;
    description?: string;
    due_date: string;
    status: string;
    category?: string;
    created_at?: string;
    updated_at?: string;
}

export default function EditSubscriptionPage() {
    const router = useRouter();
    const { alert } = useDialog();
    const params = useParams();
    const subscriptionId = params.id as string;

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        price: "",
        category: "",
        description: "",
        dueDate: new Date(),
        status: "active",
    });
    const [error, setError] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useStaggerReveal(rootRef, [isLoading, showSuccess]);

    // Fetch subscription data on component mount
    useEffect(() => {
        const fetchSubscription = async () => {
            try {
                setIsLoading(true);
                const response = await api.get(
                    `/subscriptions/${subscriptionId}`
                );
                const data = response.data;
                setSubscription(data);

                // Set form data
                setFormData({
                    name: data.name,
                    price: data.price.toString(),
                    category: data.category || "",
                    description: data.description || "",
                    dueDate: new Date(data.due_date),
                    status: data.status,
                });
            } catch (error) {
                console.error("Error fetching subscription:", error);
                setError("Unable to load subscription data.");
            } finally {
                setIsLoading(false);
            }
        };

        if (subscriptionId) {
            fetchSubscription();
        }
    }, [subscriptionId]);

    const handleChange = (
        e: ChangeEvent<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!formData.name || !formData.price || !formData.dueDate) {
            alert(
                "Please fill in the required fields: Name, Price, and Renewal Date"
            );
            return;
        }

        try {
            setIsSubmitting(true);

            // Format data for API
            const subscriptionData = {
                name: formData.name,
                price: parseFloat(formData.price),
                description: formData.description,
                dueDate: formData.dueDate.toISOString(),
                category: formData.category || undefined,
                status: formData.status,
            };

            await api.put(`/subscriptions/${subscriptionId}`, subscriptionData);

            // Show success message
            setShowSuccess(true);

            // Navigate back to subscriptions list after a delay
            setTimeout(() => {
                router.push("/subscriptions");
                router.refresh(); // Refresh to show the updated data
            }, 2000);
        } catch (error) {
            console.error("Error updating subscription:", error);
            alert("Unable to update the subscription. Please try again later.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDateChange = (date: Date | undefined) => {
        if (date) {
            setFormData((prev) => ({ ...prev, dueDate: date }));
        }
    };

    if (isLoading) {
        return (
            <div ref={rootRef} className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-ink" aria-label="Loading subscription" />
            </div>
        );
    }

    if (error) {
        return (
            <div ref={rootRef} className="max-w-xl space-y-6">
                <div role="alert" className="rounded-xl border-[1.5px] border-leak-deep bg-leak-deep/5 p-6">
                    <p className="font-semibold text-leak-deep">Error: {error}</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/subscriptions">
                        <ArrowLeft aria-hidden="true" />
                        Back to subscriptions
                    </Link>
                </Button>
            </div>
        );
    }

    if (!subscription) {
        return (
            <div ref={rootRef} className="max-w-xl space-y-6">
                <div role="alert" className="rounded-xl border-[1.5px] border-leak-deep bg-leak-deep/5 p-6">
                    <p className="font-semibold text-leak-deep">We couldn&apos;t find that subscription.</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/subscriptions">
                        <ArrowLeft aria-hidden="true" />
                        Back to subscriptions
                    </Link>
                </Button>
            </div>
        );
    }

    if (showSuccess) {
        return (
            <div ref={rootRef} className="max-w-xl">
                <div
                    role="status"
                    className="rounded-xl bg-acid p-8 text-ink"
                >
                    <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                    <p className="font-wide mt-4 text-2xl font-extrabold tracking-[-0.03em]">
                        Changes saved.
                    </p>
                    <p className="mt-2">Taking you back to your list.</p>
                </div>
            </div>
        );
    }

    return (
        <div ref={rootRef} className="space-y-10">
            <header
                data-reveal
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >
                <div>
                    <p className="eyebrow text-ink-soft">Edit subscription</p>
                    <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)] text-ink">
                        {subscription.name}
                    </h1>
                </div>
                <Button asChild variant="ghost" className="self-start sm:self-auto">
                    <Link href="/subscriptions">
                        <ArrowLeft aria-hidden="true" />
                        Back to subscriptions
                    </Link>
                </Button>
            </header>
            <form
                data-reveal
                className="max-w-xl space-y-6"
                onSubmit={handleSubmit}
            >
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Netflix, Spotify, gym..."
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="price">Price (€)</Label>
                    <Input
                        id="price"
                        name="price"
                        value={formData.price}
                        onChange={handleChange}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        className="tabular-nums"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <select
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        className={`${FIELD} h-11`}
                    >
                        <option value="">Select a category</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Music">Music</option>
                        <option value="Software">Software</option>
                        <option value="Health">Health</option>
                        <option value="Education">Education</option>
                        <option value="Other">Other</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                        id="status"
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        className={`${FIELD} h-11`}
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <fieldset className="space-y-2">
                    <legend className="mb-2 text-[13px] leading-none font-semibold">
                        Renewal date
                    </legend>
                    <div className="inline-block rounded-xl border bg-card p-2 tabular-nums">
                        <Calendar
                            mode="single"
                            selected={formData.dueDate}
                            onSelect={handleDateChange}
                            required
                        />
                    </div>
                </fieldset>

                <div className="space-y-2">
                    <Label htmlFor="description">
                        Notes <span className="font-normal text-ink-soft">(optional)</span>
                    </Label>
                    <textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        className={`${FIELD} min-h-24 py-2.5`}
                        placeholder="Shared with family, annual plan, cancel after trial..."
                    />
                </div>

                <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-ink/10 bg-paper py-4 sm:flex-row sm:justify-end">
                    <Button variant="outline" asChild>
                        <Link href="/subscriptions">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Saving...
                            </>
                        ) : (
                            "Save changes"
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
