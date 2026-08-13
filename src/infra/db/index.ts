/**
 * infra/db — Postgres access. Schema is mirrored in docs/architecture/DATA_MODEL.md.
 * Transactions are owned by application services; repositories accept a handle.
 */
export * as schema from "./schema";
export { getDb, getPool, closeDb, type Db, type Tx, type DbHandle } from "./client";
