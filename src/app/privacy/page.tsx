import type { Metadata } from "next";
import MainLayout from "@/components/layouts/MainLayout";
import { CONTROLLER, PRIVACY_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy · SubTrack" };

// ponytail: draft written from what the code actually does; have it reviewed by a lawyer before launch.
const PROCESSORS = [
    ["Vercel Inc.", "Hosting and server logs", "EU (Frankfurt), US company", "EU-US Data Privacy Framework / SCCs"],
    ["Neon (Databricks Inc.)", "Database", "EU (AWS Frankfurt), US company", "EU-US Data Privacy Framework / SCCs"],
    ["Stripe Payments Europe Ltd.", "Payments (Premium only)", "Ireland, with transfers to the USA", "SCCs"],
    ["Twilio SendGrid", "Reminder emails", "USA", "EU-US Data Privacy Framework / SCCs"],
    ["Plausible Insights OÜ", "Cookieless page-view statistics", "EU (Germany)", "Not applicable"],
];

const H2 = "font-wide mt-12 text-xl font-extrabold tracking-[-0.03em]";

export default function PrivacyPage() {
    return (
        <MainLayout>
            <article className="mx-auto max-w-3xl px-5 py-16 text-ink sm:px-8 [&_li]:mt-2 [&_p]:mt-4 [&_p]:leading-relaxed [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
                <p className="eyebrow text-ink-soft">Last updated {PRIVACY_UPDATED}</p>
                <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)]">Privacy policy</h1>

                <h2 className={H2}>Who we are</h2>
                <p>
                    {CONTROLLER.name}, {CONTROLLER.address}, is the controller of your personal data. For any
                    privacy question or request, write to{" "}
                    <a className="underline underline-offset-4" href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a>.
                </p>

                <h2 className={H2}>What we collect and why</h2>
                <ul>
                    <li><strong>Account:</strong> name, email and a hashed password. Needed to give you an account (contract, Art. 6(1)(b) RGPD).</li>
                    <li><strong>Your subscriptions:</strong> the names, prices, categories and renewal dates you type in, and your reminder settings. This is the service itself (contract).</li>
                    <li><strong>Sign-in sessions:</strong> IP address and browser user agent for each active session. Used to keep your account secure and to limit abuse (legitimate interest, Art. 6(1)(f)).</li>
                    <li><strong>Payments (Premium only):</strong> Stripe handles your card; we never see it. We keep the amount, status and date of each payment (contract and legal obligation, Art. 6(1)(c)).</li>
                    <li><strong>Statistics:</strong> anonymous page views through Plausible, without cookies or personal identifiers (legitimate interest).</li>
                </ul>
                <p>
                    We don&apos;t sell your data, don&apos;t use it for advertising and don&apos;t make automated decisions about you.
                    Only the people running SubTrack can see account data, and only to operate the service.
                </p>

                <h2 className={H2}>Cookies</h2>
                <p>
                    One cookie keeps you signed in. It is strictly necessary, so it doesn&apos;t need consent. There are no
                    tracking or advertising cookies.
                </p>

                <h2 className={H2}>How long we keep it</h2>
                <ul>
                    <li>Account, subscriptions and settings: until you delete your account.</li>
                    <li>Expired sessions: removed within a day of expiring.</li>
                    <li>Invoices: kept by Stripe for as long as Portuguese tax law requires (up to 10 years), even after you delete your account.</li>
                </ul>

                <h2 className={H2}>Who processes it for us</h2>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-ink/15">
                                <th className="py-2 pr-4">Provider</th>
                                <th className="py-2 pr-4">Purpose</th>
                                <th className="py-2 pr-4">Location</th>
                                <th className="py-2">Transfer safeguard</th>
                            </tr>
                        </thead>
                        <tbody>
                            {PROCESSORS.map(([who, what, where, basis]) => (
                                <tr key={who} className="border-b border-ink/10 align-top">
                                    <td className="py-2 pr-4 font-semibold">{who}</td>
                                    <td className="py-2 pr-4">{what}</td>
                                    <td className="py-2 pr-4">{where}</td>
                                    <td className="py-2">{basis}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <h2 className={H2}>Your rights</h2>
                <p>
                    You can access, correct, export or delete your data, restrict or object to its processing. Two of
                    these are one click away in <a className="underline underline-offset-4" href="/settings">Settings</a>:
                    &ldquo;Download my data&rdquo; and &ldquo;Delete account&rdquo;. For anything else, email us and
                    we&apos;ll answer within one month.
                </p>
                <p>
                    You can also complain to the Portuguese data protection authority, the CNPD (
                    <a className="underline underline-offset-4" href="https://www.cnpd.pt">www.cnpd.pt</a>).
                </p>
            </article>
        </MainLayout>
    );
}
