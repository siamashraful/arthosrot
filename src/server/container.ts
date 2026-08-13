import { AccountService, type AccountProvisioner } from "@/core/accounts";
import { LedgerService } from "@/core/ledger";
import { env } from "@/env";
import { accountsRepository } from "@/infra/db/repositories/accounts";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { pgTransactionRunner } from "@/infra/db/tx";

/**
 * Composition root — the only place concrete adapters meet core services.
 * Everything is lazy so builds and tests without a full environment work.
 */

export interface Container {
  accountService: AccountService;
  ledgerService: LedgerService;
}

let cached: Container | undefined;

/** Instant venue provisioning for the deterministic broker (offline/local/test). */
const deterministicProvisioner: AccountProvisioner = {
  async provision(account) {
    return { broker: "DETERMINISTIC", externalAccountId: `det-${account.id}` };
  },
};

function build(): Container {
  const { BROKER_PROVIDER } = env();

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

  return { accountService, ledgerService };
}

export function getContainer(): Container {
  return (cached ??= build());
}
