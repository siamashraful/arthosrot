/**
 * core/brokers/deterministic — the offline execution venue (ADR-006).
 * No vendor dependencies, hence lives in core.
 */
export {
  DEFAULT_DETERMINISTIC_CONFIG,
  DeterministicPaperBroker,
  type DeterministicBrokerConfig,
} from "./deterministic-broker";
