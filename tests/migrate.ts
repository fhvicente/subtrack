import type { TestProject } from "vitest/node";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Brings the test database up to date once, like `npm run db:migrate` before a deploy.
export default async function setup(project: TestProject) {
    const db = drizzle(project.config.env.DATABASE_URL!);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.$client.end();
}
