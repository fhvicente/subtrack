# SubTrack

**Find out what your subscriptions really cost — and cut the ones you forgot about.**

SubTrack keeps every recurring charge (streaming, cloud, gym, apps) in one list, shows the real monthly and yearly total, and emails you before a renewal hits your card. It's built for anyone who has looked at a bank statement and wondered *"wait, what is that?"*.

## Features

- **One list for every renewal**: add each subscription with its price, billing cycle and next due date.
- **The real number**: monthly spend converted to the yearly total, so €9.99 doesn't look small anymore.
- **Renewal reminders**: a daily job emails you a set number of days before each payment (you pick how many in Settings).
- **Free and Premium plans**: the free plan tracks up to 3 subscriptions. Premium (€9.99/month, through Stripe Checkout) removes the limit.
- **Accounts and security**: email/password sign-up with better-auth (server-side sessions in an httpOnly cookie, so signing out really ends the session), and rate limits stored in Postgres so they hold across serverless instances.
- **Admin panel**: admins (set by `ADMIN_EMAILS`) can view users, manage plans and trigger the renewal emails.

## Tech stack

The whole thing is one Next.js app: pages live in `src/app`, the REST API is route handlers in `src/app/api`, and server-only code is in `src/server`.

| Layer | Tools |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Radix UI, GSAP |
| Backend | Next.js route handlers, Zod validation |
| Database | PostgreSQL (`pg`); Docker for local dev, Neon in production |
| Auth | better-auth (email + password, database sessions) |
| Payments | Stripe (Checkout + webhooks) |
| Email | SendGrid; Vercel Cron triggers the daily renewal job |
| Tests | Vitest against a real Postgres database |

## Getting started

Before you start, install Node.js 20+ and Docker.

```bash
npm install
npm run db    # starts Postgres in Docker and waits until it is healthy
DATABASE_URL=postgres://subtrack:subtrack@localhost:5432/subtrack npm run db:migrate
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). `.env.development` already points `DATABASE_URL` at the local container (drizzle-kit doesn't read it, hence the explicit variable above). To stop the container, run `docker compose down` (add `-v` to delete the data).

### Upgrading a database from before better-auth

A database created before better-auth must be reset once, in this order. The schema is cached per server process, and old code recreates the old tables.

1. Deploy the new code.
2. Run the DROP. Locally, in the container:

   ```bash
   docker compose exec db psql -U subtrack -c 'DROP TABLE IF EXISTS users, subscriptions, notification_settings, payment_logs, rate_limits, "user", session, account, verification, "rateLimit" CASCADE'
   ```

   On Neon, run the same `DROP TABLE` once in the SQL editor. It deletes all data, which is acceptable only because there are no real users yet.
3. Trigger a Vercel Redeploy so warm functions drop their cached schema (locally: restart `npm run dev`).
4. Check with `\d subscriptions` that the foreign key says `REFERENCES "user"(id)`.

Don't point a preview deployment at the shared Neon DB before the reset.

### Environment variables (`.env.local`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | Signs session cookies (32+ random chars: `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | Exact origin users load (scheme + host; apex vs `www` matters), e.g. `http://localhost:3000` (already set in `.env.development`). Any other origin gets 403 on sign-in/sign-up |
| `BETTER_AUTH_TRUSTED_ORIGINS` | no | Extra trusted origins, comma-separated with no spaces; `*` wildcards allowed. For the Vercel Preview environment use a project-scoped pattern such as `https://<project>-*-<team>.vercel.app`; never a bare `*.vercel.app` |
| `DATABASE_URL` | yes | Postgres connection string (already set in `.env.development` for local dev) |
| `FRONTEND_URL` | for payments/email | Public app URL, used in Stripe redirects and email links |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID` | for payments | Without them, the payment routes return 503 |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | for email | Without them, emails are only written to the log |
| `CRON_SECRET` | in production | Vercel sends it to `/api/cron/renewals`; without it, the route returns 401 |
| `ADMIN_EMAILS` | no | Comma-separated list of admin emails (`isAdmin` flag on `/api/users/profile`) |

### Tests

`npm test` runs the API route handlers against a `subtrack_test` database in the same container. Create that database once:

```bash
docker compose exec db psql -U subtrack -c "CREATE DATABASE subtrack_test"
```

The test run applies the migrations itself. Stripe network calls are stubbed, and webhooks are signed with a test secret.

### Database changes

The schema lives in `src/server/schema.ts` (Drizzle). To change it, edit that file, run `npm run db:generate` (writes a SQL migration into `drizzle/`), review the SQL and commit it with the code. `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL`. The first migration, `0000_baseline`, is the schema the app used to create on its own; it only uses `CREATE TABLE IF NOT EXISTS`, so on a database that already has those tables it changes nothing and is just recorded.

## API overview

| Area | Routes |
| --- | --- |
| Auth (better-auth) | `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session` |
| Subscriptions | `GET/POST /api/subscriptions`, `GET/PUT/DELETE /api/subscriptions/:id` |
| Profile & notifications | `/api/users/profile` (the current user), `/api/notifications/settings`, `POST /api/notifications/test` |
| Payments | `/api/payments/session`, `/api/payments/status`, `/api/payments/history`, `/api/payments/cancel-subscription`, `POST /api/payments/webhook` |
| Admin | `/api/admin`, `/api/admin/users/:id`, `/api/admin/renewals` |
| Cron | `GET /api/cron/renewals` (protected by `CRON_SECRET`) |

## Deployment

The app runs on Vercel and the database on Neon. Import the repo into Vercel and set the environment variables listed above. For `DATABASE_URL`, use Neon's **pooled** connection string (the host contains `-pooler`). Migrations are not run by the build: before deploying code that needs a new migration, run `DATABASE_URL=<Neon direct connection string> npm run db:migrate` (the direct, non-pooled string). `vercel.json` schedules `/api/cron/renewals` every day at 08:00 UTC to send the renewal emails. When moving an existing deployment to better-auth, follow [Upgrading a database from before better-auth](#upgrading-a-database-from-before-better-auth).

Add a Stripe webhook that points to `https://<your-domain>/api/payments/webhook`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
