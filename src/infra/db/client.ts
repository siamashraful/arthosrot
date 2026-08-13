import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** A database handle usable inside or outside a transaction. */
export type DbHandle = Db | Tx;

let pool: Pool | undefined;
let db: Db | undefined;

export function getPool(): Pool {
  if (!pool) {
    const { DATABASE_URL } = env();
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured (see .env.example)");
    }
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

/** Test/worker shutdown helper. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
