import { AccountService, type AccountProvisioner } from "@/core/accounts";
import { InstrumentService } from "@/core/instruments";
import { LedgerService } from "@/core/ledger";
import type { MarketDataProvider } from "@/core/market-data";
import { systemClock } from "@/core/shared";
import { env } from "@/env";
import { accountsRepository } from "@/infra/db/repositories/accounts";
import { instrumentsRepository } from "@/infra/db/repositories/instruments";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { pgTransactionRunner } from "@/infra/db/tx";
import { AlpacaMarketData, CachedMarketData, FixtureProvider } from "@/infra/market-data";

/**
 * Composition root — the only place concrete adapters meet core services.
 * Everything is lazy so builds and tests without a full environment work.
 */

export interface Container {
  accountService: AccountService;
  ledgerService: LedgerService;
  marketData: MarketDataProvider;
  instrumentService: InstrumentService;
  /** Only set in deterministic mode — test/dev hooks (setPrice etc.). */
  fixtureProvider: FixtureProvider | null;
}

let cached: Container | undefined;

/** Instant venue provisioning for the deterministic broker (offline/local/test). */
const deterministicProvisioner: AccountProvisioner = {
  async provision(account) {
    return { broker: "DETERMINISTIC", externalAccountId: `det-${account.id}` };
  },
};

function build(): Container {
  const { BROKER_PROVIDER, MARKET_DATA_PROVIDER, ALPACA_DATA_KEY, ALPACA_DATA_SECRET } = env();

  let fixtureProvider: FixtureProvider | null = null;
  let marketData: MarketDataProvider;
  if (MARKET_DATA_PROVIDER === "fixture") {
    fixtureProvider = new FixtureProvider(systemClock);
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

  const provisioner: AccountProvisioner =
    BROKER_PROVIDER === "deterministic"
      ? deterministicProvisioner
      : // AlpacaPaperBroker provisioning arrives with the external-adapter phase;
        // until then alpaca-paper mode cannot open accounts.
        {
          async provision() {
            throw new Error("alpaca-paper provisioning not implemented yet (see docs/ROADMAP.md)");
          },
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

  return { accountService, ledgerService, marketData, instrumentService, fixtureProvider };
}

export function getContainer(): Container {
  return (cached ??= build());
}
