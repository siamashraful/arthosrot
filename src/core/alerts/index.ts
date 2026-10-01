/**
 * core/alerts — per-user, one-shot price alerts (ADR-016): threshold
 * validation, the ACTIVE → TRIGGERED | CANCELED state machine, trigger
 * evaluation on fresh in-session quotes, and the service the API and the
 * worker job share. Display data only — never an input to execution.
 */
export {
  ALERT_MAX_QUOTE_AGE_MS,
  canTransitionAlert,
  checkActiveAlertLimit,
  conditionHolds,
  evaluateAlert,
  MAX_ACTIVE_ALERTS_PER_USER,
  parseAlertThreshold,
  type AlertDirection,
  type AlertEvaluation,
  type AlertHoldReason,
  type AlertState,
} from "./rules";
export {
  DEFAULT_PRICE_ALERTS_CONFIG,
  PriceAlertService,
  type AlertEvaluationResult,
  type AlertQuoteSource,
  type NewPriceAlert,
  type PriceAlert,
  type PriceAlertsConfig,
  type PriceAlertsRepository,
} from "./service";
