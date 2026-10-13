import sgMail from "@sendgrid/mail";
import { and, eq, getTableColumns } from "drizzle-orm";
import { db } from "./db";
import { notificationSettings, subscriptions, user } from "./schema";

const apiKey = process.env.SENDGRID_API_KEY;
const configured = !!apiKey?.startsWith("SG.");
if (configured) sgMail.setApiKey(apiKey!);

const DAY = 24 * 60 * 60 * 1000;

// User-typed values (names, subscription fields) must not become markup in the email.
const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const layout = (body: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    ${body}
    <p style="margin-top: 30px; font-size: 12px; color: #666;">
        Atenciosamente,<br>
        Equipe Gestor Simples de Assinaturas
    </p>
</div>`;

export async function sendEmail(to: string, subject: string, text: string, html: string) {
    if (!configured) {
        console.log(`[EMAIL SIMULATION] Subject: ${subject}`); // no address: logs must not hold personal data
        return true;
    }
    try {
        await sgMail.send({ to, from: process.env.EMAIL_FROM!, subject, text, html });
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}

export function sendTestEmail(user: { name: string; email: string }) {
    const text = `Olá ${user.name || ""},\n\nEste é um teste de notificação por email do Gestor Simples de Assinaturas.\n\nSe você recebeu este email, suas notificações estão configuradas corretamente.`;
    return sendEmail(
        user.email,
        "Teste de Notificação - Gestor de Assinaturas",
        text,
        layout(`
    <h2 style="color: #333;">Teste de Notificação</h2>
    <p>Olá ${esc(user.name)},</p>
    <p>Este é um teste de notificação por email do Gestor Simples de Assinaturas.</p>
    <p>Se você recebeu este email, suas notificações estão configuradas corretamente.</p>`)
    );
}

type Renewal = Awaited<ReturnType<typeof upcoming>>[number];

function sendRenewalEmail(sub: Renewal) {
    const date = new Date(sub.due_date).toLocaleDateString("pt-BR");
    const price = Number(sub.price).toFixed(2);
    const text = `Olá ${sub.userName || ""},\n\nSua assinatura de ${sub.name} irá renovar em ${date}. O valor da renovação é de R$ ${price}.\n\nAcesse sua conta para gerenciar esta assinatura.`;
    return sendEmail(
        sub.userEmail,
        `Lembrete de Renovação: ${sub.name}`,
        text,
        layout(`
    <h2 style="color: #333;">Lembrete de Renovação</h2>
    <p>Olá ${esc(sub.userName)},</p>
    <p>Sua assinatura de <strong>${esc(sub.name)}</strong> irá renovar em <strong>${date}</strong>.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Valor:</strong> R$ ${price}</p>
        <p style="margin: 5px 0;"><strong>Categoria:</strong> ${esc(sub.category)}</p>
    </div>
    <p>Acesse sua conta para gerenciar esta assinatura.</p>
    <div style="margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL}/subscriptions/${esc(sub.id)}" style="background-color: #4a5568; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Gerenciar Assinatura</a>
    </div>`)
    );
}

// ponytail: no "already sent" log; relies on running once a day. Add a sent_notifications table if the cron can fire more often.
const upcoming = () =>
    db
        .select({
            ...getTableColumns(subscriptions),
            userName: user.name,
            userEmail: user.email,
            days_before_renewal: notificationSettings.days_before_renewal,
        })
        .from(subscriptions)
        .innerJoin(user, eq(subscriptions.user_id, user.id))
        .innerJoin(notificationSettings, eq(notificationSettings.user_id, user.id))
        .where(and(eq(subscriptions.status, "active"), eq(notificationSettings.email_enabled, 1)));

export async function checkUpcomingRenewals() {
    const subs = await upcoming();
    const now = Date.now();
    let sent = 0;
    for (const sub of subs) {
        const daysUntil = Math.ceil((new Date(sub.due_date).getTime() - now) / DAY);
        if (daysUntil === sub.days_before_renewal && (await sendRenewalEmail(sub))) sent++;
    }
    console.log(`Sent ${sent} renewal notifications`);
    return sent;
}
