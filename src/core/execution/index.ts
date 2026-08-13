/**
 * core/execution — Broker port, canonical event application, fill effects
 * (ADR-005, ADR-008; docs/architecture/EXECUTION.md).
 */
export type {
  Broker,
  BrokerAccountSnapshot,
  BrokerOrderRequest,
  BrokerOrderSnapshot,
  CancelResult,
  EventCursor,
  ProvisionRequest,
  Subscription,
  SubmitResult,
} from "./broker";
export { ExecutionService, type FillRecord, type FillsRepository } from "./execution";
