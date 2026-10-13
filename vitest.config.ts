import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: route handlers run against a real Postgres (`npm run db`), Stripe network calls are stubbed.
export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: {
        fileParallelism: false, // files share one database
        globalSetup: "./tests/migrate.ts",
        env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://subtrack:subtrack@localhost:5432/subtrack_test",
            BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars",
            BETTER_AUTH_URL: "http://localhost:3000",
            STRIPE_SECRET_KEY: "sk_test_dummy",
            STRIPE_WEBHOOK_SECRET: "whsec_test",
            STRIPE_MONTHLY_PRICE_ID: "price_test",
            FRONTEND_URL: "http://localhost:3000",
            CRON_SECRET: "cron-secret",
            SENDGRID_API_KEY: "",
        },
    },
});
