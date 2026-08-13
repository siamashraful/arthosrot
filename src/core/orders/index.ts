/**
 * core/orders — order entity, canonical state machine, validation taxonomy,
 * reservations, idempotent placement (ADR-005, ADR-008).
 */
export {
  OPEN_STATES,
  remainingQty,
  STATE_DISPLAY,
  TERMINAL_STATES,
  type CanonicalBrokerEvent,
  type CanonicalEventType,
  type Order,
  type OrderEventSource,
  type OrderSide,
  type OrderState,
  type OrderType,
  type TimeInForce,
} from "./types";
export {
  InvalidTransitionError,
  isTerminal,
  planTransitions,
  type TransitionStep,
} from "./state-machine";
export {
  OrdersService,
  type NewOrderInput,
  type OrderEventRecord,
  type OrdersConfig,
  type OrdersRepository,
  type PlacedOrder,
  type PositionReader,
} from "./service";
