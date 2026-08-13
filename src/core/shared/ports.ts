/** Injected time source — core never reads the wall clock directly. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Opaque transaction handle. Core passes it through to repository ports;
 * only infra knows its concrete type. Transactions are owned by application
 * services (docs/architecture/MODULE_BOUNDARIES.md rule 6).
 */
export interface TxHandle {
  readonly __tx?: "opaque";
}

export interface TransactionRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}
