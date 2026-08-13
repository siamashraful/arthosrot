import { AccountService, type AccountProvisioner } from "@/core/accounts";
import { DeterministicPaperBroker } from "@/core/brokers/deterministic";
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
import { fillsReplaySource, fillsRepository } from "@/infra/db/repositories/fills";
import { instrumentsRepository } from "@/infra/db/repositories/instruments";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { ordersRepository } from "@/infra/db/repositories/orders";
import { positionsRepository } from "@/infra/db/repositories/positions";
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
  if (BROKER_PROVIDER === "deterministic") {
    deterministicBroker = new DeterministicPaperBroker(systemClock, marketData);
    broker = deterministicBroker;
  } else {
    const { ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET } = env();
    if (!ALPACA_BROKER_KEY || !ALPACA_BROKER_SECRET) {
      throw new Error("ALPACA_BROKER_KEY/SECRET required for BROKER_PROVIDER=alpaca-paper");
    }
    // Web process: submit/cancel/provision only. Event ingestion + cursor
    // management belong to the WORKER (src/worker/main.ts, ADR-010).
    broker = new AlpacaPaperBroker(ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET);
  }

  const provisioner: AccountProvisioner = {
    provision: (account) =>
      broker.provisionAccount({
        ledgerlineAccountId: account.id,
        startingCash: account.startingCash,
      }),
  };

  /* eslint-disable prefer-const */
  let ledgerService: LedgerService;
  const accountService = new AccountService(
    accountsRepository,
    pgTransactionRunner,
    provisioner,
    () => ledgerService,
  );
  ledgerService = new LedgerService(ledgerRepository, accountService);
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

  return {
    accountService,
    ledgerService,
    marketData,
    instrumentService,
    ordersService,
    executionService,
    portfolioService,
    reconciliationService,
    broker,
    fillsReader,
    fixtureProvider,
    deterministicBroker,
  };
}

export function getContainer(): Container {
  return (cached ??= build());
}

/** Test-only: reset the container (fresh broker/event log between scenarios). */
export function resetContainerForTests(): void {
  cached = undefined;
}
