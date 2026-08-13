import type { TransactionRunner, TxHandle } from "@/core/shared";
import { getDb, type DbHandle } from "./client";

/** Infra owns the concrete transaction type; core sees the opaque TxHandle. */
export function asDb(tx: TxHandle): DbHandle {
  return tx as unknown as DbHandle;
}

export function asTx(handle: DbHandle): TxHandle {
  return handle as unknown as TxHandle;
}

export const pgTransactionRunner: TransactionRunner = {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return getDb().transaction((tx) => fn(asTx(tx)));
  },
};
