import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Money } from "@/core/money";
import { closeDb, getDb, schema } from "@/infra/db";
import { asTx } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer } from "@/server/container";
import { truncateAll } from "./helpers";

describe("account provisioning & ledger (invariant 6)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  async function signUpUser(email: string): Promise<string> {
    const res = await getAuth().api.signUpEmail({
      body: { name: "Test", email, password: "correct horse 9" },
    });
    return res.user.id;
  }

  it("signup opens an ACTIVE paper account with the opening DEPOSIT (counted once)", async () => {
    const userId = await signUpUser("a@example.com");
    const account = await getContainer().accountService.getActiveForUser(userId);

    expect(account).not.toBeNull();
    expect(account!.status).toBe("ACTIVE");
    expect(account!.mode).toBe("PAPER");
    expect(account!.cashBalance.toString()).toBe("100000.00");
    expect(account!.startingCash.toString()).toBe("100000.00");

    const entries = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, account!.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entryType).toBe("DEPOSIT");
    expect(entries[0]!.amount).toBe("100000.00");

    const brokerAccounts = await getDb()
      .select()
      .from(schema.brokerAccounts)
      .where(eq(schema.brokerAccounts.tradingAccountId, account!.id));
    expect(brokerAccounts).toHaveLength(1);
    expect(brokerAccounts[0]!.broker).toBe("DETERMINISTIC");
  });

  it("cash projection reconciles with the ledger after multiple postings", async () => {
    const userId = await signUpUser("b@example.com");
    const { accountService, ledgerService } = getContainer();
    const account = (await accountService.getActiveForUser(userId))!;

    await getDb().transaction(async (tx) => {
      await ledgerService.post(asTx(tx), {
        accountId: account.id,
        entryType: "TRADE",
        amount: Money.fromString("-2000.00"),
        refType: "FILL",
        refId: "test-fill-1",
        description: "Bought 10 TEST @ 200.00",
      });
      await ledgerService.post(asTx(tx), {
        accountId: account.id,
        entryType: "FEE",
        amount: Money.fromString("-1.25"),
        refType: "FILL",
        refId: "test-fill-1",
        description: "Commission",
      });
    });

    const result = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(result.inBalance).toBe(true);
    expect(result.projected.toString()).toBe("97998.75");
    expect(result.cached.toString()).toBe("97998.75");
  });

  it("two users get isolated accounts", async () => {
    const u1 = await signUpUser("c1@example.com");
    const u2 = await signUpUser("c2@example.com");
    const a1 = await getContainer().accountService.getActiveForUser(u1);
    const a2 = await getContainer().accountService.getActiveForUser(u2);
    expect(a1!.id).not.toBe(a2!.id);
    expect(a1!.userId).toBe(u1);
    expect(a2!.userId).toBe(u2);
  });

  it("detects drift when the projection is tampered with (invariant 6 alarm)", async () => {
    const userId = await signUpUser("d@example.com");
    const account = (await getContainer().accountService.getActiveForUser(userId))!;

    // Simulate projection corruption (the ledger itself cannot be mutated).
    await getDb()
      .update(schema.accounts)
      .set({ cashBalance: "99999.00" })
      .where(eq(schema.accounts.id, account.id));

    const result = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(result.inBalance).toBe(false);
    expect(result.drift.toString()).toBe("-1.00");
  });
});
