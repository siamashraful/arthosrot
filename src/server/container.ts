import { AccountService, type AccountProvisioner } from "@/core/accounts";
import { PriceAlertService } from "@/core/alerts";
import { DeterministicPaperBroker } from "@/core/brokers/deterministic";
import {
  CashTransferService,
  DEFAULT_TRANSFER_LIMITS,
  type CashTransferVenue,
} from "@/core/cash-transfers";
import { ExecutionService, type Broker } from "@/core/execution";
import { InstrumentService } from "@/core/instruments";
import { LedgerService } from "@/core/ledger";
import type { MarketDataProvider } from "@/core/market-data";
import { OrdersService } from "@/core/orders";
import { PortfolioService } from "@/core/portfolio";
import { ReconciliationService } from "@/core/reconciliation";
import { systemClock } from "@/core/shared";
import { env } from "@/env";
import { accountsRepository } from "@/infra/db/repositories/accounts";
import { cashTransfersRepository } from "@/infra/db/repositories/cash-transfers";
import { fillsReplaySource, fillsRepository } from "@/infra/db/repositories/fills";
import { instrumentsRepository } from "@/infra/db/repositories/instruments";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { ordersRepository } from "@/infra/db/repositories/orders";
import { positionsRepository } from "@/infra/db/repositories/positions";
import { priceAlertsRepository } from "@/infra/db/repositories/price-alerts";
import { reconciliationReads } from "@/infra/db/repositories/reconciliation";
import { pgTransactionRunner } from "@/infra/db/tx";
import { AlpacaPaperBroker } from "@/infra/brokers/alpaca";
import { AlpacaMarketData, CachedMarketData, FixtureProvider } from "@/infra/market-data";

/**
 * Composition root — the only place concrete adapters meet core services.
 * Everything is lazy so builds and tests without a full environment work.
 */

export interface SerializedFill {
  qty: string;
  price: string;
  fee: string;
  notional: string;
  executionId: string;
  occurredAt: string;
}

export interface Container {
  accountService: AccountService;
  ledgerService: LedgerService;
  marketData: MarketDataProvider;
  instrumentService: InstrumentService;
  ordersService: OrdersService;
  executionService: ExecutionService;
  portfolioService: PortfolioService;
  reconciliationService: ReconciliationService;
  cashTransferService: CashTransferService;
  /** Price alerts (ADR-016): display-data notifications, never execution. */
  priceAlertService: PriceAlertService;
  broker: Broker;
  fillsReader: { listForOrder(orderId: string): Promise<SerializedFill[]> };
  /** Deterministic-mode test/dev hooks; null in alpaca-paper mode. */
  fixtureProvider: FixtureProvider | null;
  deterministicBroker: DeterministicPaperBroker | null;
}

let cached: Container | undefined;

function build(): Container {
  const {
    BROKER_PROVIDER,
    MARKET_DATA_PROVIDER,
    ALPACA_DATA_KEY,
    ALPACA_DATA_SECRET,
    MARKET_BUY_BUFFER,
  } = env();

  let fixtureProvider: FixtureProvider | null = null;
  let marketData: MarketDataProvider;
  if (MARKET_DATA_PROVIDER === "fixture") {
    fixtureProvider = new FixtureProvider(systemClock);
    if (env().FORCE_MARKET_OPEN && BROKER_PROVIDER === "deterministic") {
      fixtureProvider.setMarketStatus("OPEN"); // dev/test-only (see .env.example)
    }
    marketData = fixtureProvider;
  } else {
    if (!ALPACA_DATA_KEY || !ALPACA_DATA_SECRET) {
      throw new Error("ALPACA_DATA_KEY/SECRET required for MARKET_DATA_PROVIDER=alpaca");
    }
    marketData = new CachedMarketData(
      new AlpacaMarketData(systemClock, ALPACA_DATA_KEY, ALPACA_DATA_SECRET),
      systemClock,
    );
  }

  let deterministicBroker: DeterministicPaperBroker | null = null;
  let broker: Broker;
  // The paper venue also moves simulated cash (ADR-015) — same instance.
  let transferVenue: CashTransferVenue;
  if (BROKER_PROVIDER === "deterministic") {
    deterministicBroker = new DeterministicPaperBroker(systemClock, marketData);
    broker = deterministicBroker;
    transferVenue = deterministicBroker;
  } else {
    const { ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET } = env();
    if (!ALPACA_BROKER_KEY || !ALPACA_BROKER_SECRET) {
      throw new Error("ALPACA_BROKER_KEY/SECRET required for BROKER_PROVIDER=alpaca-paper");
    }
    // Web process: submit/cancel/provision only. Event ingestion + cursor
    // management belong to the WORKER (src/worker/main.ts, ADR-010).
    const alpaca = new AlpacaPaperBroker(ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET);
    broker = alpaca;
    transferVenue = alpaca;
  }

  const provisioner: AccountProvisioner = {
    provision: (account) =>
      broker.provisionAccount({
        arthosrotAccountId: account.id,
        startingCash: account.startingCash,
      }),
    // Venue-settled cash gates activation (async ACH funding — INTEGRATIONS.md).
    settledCash: async (ref) => (await broker.getAccountSnapshot(ref.externalAccountId)).cash,
  };

  /* eslint-disable prefer-const */
  let ledgerService: LedgerService;
  let cashTransferService: CashTransferService;
  const accountService = new AccountService(
    accountsRepository,
    pgTransactionRunner,
    provisioner,
    () => ledgerService,
    // Reset: cancel PENDING transfers inside the archive tx (no orphaned holds).
    () => [(tx, accountId) => cashTransferService.cancelPendingForAccount(tx, accountId)],
  );
  ledgerService = new LedgerService(ledgerRepository, accountService);
  cashTransferService = new CashTransferService(
    cashTransfersRepository,
    accountsRepository,
    ordersRepository,
    () => ledgerService,
    transferVenue,
    pgTransactionRunner,
    systemClock,
    { limits: DEFAULT_TRANSFER_LIMITS, venueGraceMs: 10 * 60_000, historyLimit: 20 },
  );
  /* eslint-enable prefer-const */

  const instrumentService = new InstrumentService(
    instrumentsRepository,
    pgTransactionRunner,
    marketData,
  );

  const ordersService = new OrdersService(
    ordersRepository,
    accountsRepository,
    positionsRepository,
    cashTransfersRepository,
    pgTransactionRunner,
    { marketBuyBuffer: MARKET_BUY_BUFFER },
  );

  const executionService = new ExecutionService(
    broker,
    ordersService,
    accountsRepository,
    positionsRepository,
    fillsRepository,
    ledgerService,
    pgTransactionRunner,
    systemClock,
  );
  // In-process event delivery is a deterministic-broker property; the Alpaca
  // stream is consumed by the worker with a persisted cursor instead.
  if (deterministicBroker) executionService.start();

  const reconciliationService = new ReconciliationService(
    broker,
    ordersService,
    accountsRepository,
    ledgerService,
    reconciliationReads,
    (event) => executionService.onBrokerEvent(event),
    pgTransactionRunner,
    systemClock,
  );

  const portfolioService = new PortfolioService(
    positionsRepository,
    fillsReplaySource,
    ordersRepository,
    cashTransfersRepository,
    pgTransactionRunner,
    marketData,
  );

  const fillsReader = {
    async listForOrder(orderId: string): Promise<SerializedFill[]> {
      const fills = await pgTransactionRunner.run((tx) =>
        fillsRepository.listForOrder(tx, orderId),
      );
      return fills.map((f) => ({
        qty: f.qty.toString(),
        price: f.price,
        fee: f.fee,
        notional: f.notional,
        executionId: f.executionId,
        occurredAt: f.occurredAt.toISOString(),
      }));
    },
  };

  // Alerts read the same (cached) quotes the UI shows (ADR-016).
  const priceAlertService = new PriceAlertService(
    priceAlertsRepository,
    marketData,
    pgTransactionRunner,
    systemClock,
  );

  return {
    accountService,
    ledgerService,
    marketData,
    instrumentService,
    ordersService,
    executionService,
    portfolioService,
    reconciliationService,
    cashTransferService,
    priceAlertService,
    broker,
    fillsReader,
    fixtureProvider,
    deterministicBroker,
  };
}

/**
 * In development, park the container on globalThis: Next's dev server
 * re-evaluates server modules on every edit, and a fresh container would
 * forget the deterministic venue's in-memory resting orders (later cancels
 * would be refused). Production builds evaluate the module once.
 */
const devStore = globalThis as typeof globalThis & { __arthosrotContainer?: Container };

export function getContainer(): Container {
  if (env().NODE_ENV === "development") {
    return (devStore.__arthosrotContainer ??= build());
  }
  return (cached ??= build());
}

/** Test-only: reset the container (fresh broker/event log between scenarios). */
export function resetContainerForTests(): void {
  cached = undefined;
  devStore.__arthosrotContainer = undefined;
}
