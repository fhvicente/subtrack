import {
    type AnyPgColumn,
    bigint,
    boolean,
    doublePrecision,
    foreignKey,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
} from "drizzle-orm/pg-core";

// Change this file, then `npm run db:generate` writes the migration into drizzle/.
// JS keys are the column names: routes return rows as-is and the frontend reads `due_date`, `premiumUntil`, ...
// Constraint names are the ones Postgres gave the original CREATE TABLEs, so the baseline matches existing databases.
const tz = { withTimezone: true } as const;
const createdAt = () => timestamp(tz).defaultNow().notNull();

// better-auth's default schema (src/server/better-auth.ts).
// plan / premiumUntil / stripeCustomerId are better-auth additionalFields.
export const user = pgTable("user", {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
    plan: text().default("free").notNull(),
    premiumUntil: timestamp(tz),
    stripeCustomerId: text(),
}, (t) => [unique("user_email_key").on(t.email)]);

const userFk = (name: string, column: AnyPgColumn) =>
    foreignKey({ name, columns: [column], foreignColumns: [user.id] }).onDelete("cascade");

export const session = pgTable("session", {
    id: text().primaryKey(),
    expiresAt: timestamp(tz).notNull(),
    token: text().notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull(),
}, (t) => [userFk("session_userId_fkey", t.userId), unique("session_token_key").on(t.token)]);

export const account = pgTable("account", {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(tz),
    refreshTokenExpiresAt: timestamp(tz),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
}, (t) => [userFk("account_userId_fkey", t.userId)]);

export const verification = pgTable("verification", {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp(tz).notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
});

export const rateLimit = pgTable("rateLimit", {
    id: text().primaryKey(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: "number" }).notNull(),
}, (t) => [unique("rateLimit_key_key").on(t.key)]);

export const subscriptions = pgTable("subscriptions", {
    id: text().primaryKey(),
    user_id: text(),
    name: text().notNull(),
    description: text(),
    due_date: timestamp(tz).notNull(),
    price: doublePrecision().notNull(),
    status: text().default("active"),
    category: text(),
    created_at: timestamp(tz).defaultNow(),
    updated_at: timestamp(tz).defaultNow(),
}, (t) => [userFk("subscriptions_user_id_fkey", t.user_id)]);

// Toggles stay 1/0 integers: the settings page compares them with `=== 1`.
export const notificationSettings = pgTable("notification_settings", {
    id: text().primaryKey(),
    user_id: text().notNull(),
    email_enabled: integer().default(1),
    sms_enabled: integer().default(0),
    push_enabled: integer().default(0),
    days_before_renewal: integer().default(3),
    created_at: timestamp(tz).defaultNow(),
    updated_at: timestamp(tz).defaultNow(),
}, (t) => [
    userFk("notification_settings_user_id_fkey", t.user_id),
    unique("notification_settings_user_id_key").on(t.user_id),
]);

export const paymentLogs = pgTable("payment_logs", {
    id: text().primaryKey(),
    user_id: text().notNull(),
    amount: doublePrecision().notNull(),
    status: text().notNull(),
    provider: text().default("stripe"),
    stripeSessionId: text(),
    plan: text(),
    notes: text(),
    created_at: timestamp(tz).defaultNow(),
    updated_at: timestamp(tz).defaultNow(),
}, (t) => [userFk("payment_logs_user_id_fkey", t.user_id)]);

export const rateLimits = pgTable("rate_limits", {
    key: text().primaryKey(),
    count: integer().notNull(),
    reset_at: timestamp(tz).notNull(),
});
