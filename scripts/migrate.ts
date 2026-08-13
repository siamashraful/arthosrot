import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/infra/db/client";

async function main(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
