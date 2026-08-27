/**
 * Integration-test environment. Runs before test modules are imported;
 * env() is lazy, so setting process.env here is sufficient.
 * CI provides TEST_DATABASE_URL via a postgres service container.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://arthosrot:arthosrot@localhost:5432/arthosrot_test";
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-000";
process.env.BROKER_PROVIDER = "deterministic";
process.env.MARKET_DATA_PROVIDER = "fixture";
