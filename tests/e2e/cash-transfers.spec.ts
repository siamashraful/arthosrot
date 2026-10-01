import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { centsToString, toCents } from "../../src/lib/cash-transfer";
import { formatMoney, formatSignedMoney } from "../../src/lib/format";

/**
 * Paper cash transfers from Settings → Cash (deterministic broker: transfers
 * settle instantly). Deposit and withdrawal land in the balance and in
 * Activity; amounts over what's withdrawable are blocked before review; a
 * resting limit buy's reservation is excluded from "Available to withdraw"
 * and from the Max chip. Expected values are derived exactly in cents — never
 * float arithmetic on money. Both viewport projects run this file.
 */

const email = () => `e2e-cash-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function signUpWithAccount(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Cash");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
}

/** The ticket is docked >= lg and a bottom sheet below — return its scope. */
async function openTicket(page: Page) {
  const trigger = page.locator(".ticket-mobile").getByRole("button", { name: /^Trade / });
  const docked = page.locator(".ticket-docked").getByRole("heading", { name: /^Trade / });
  await expect(trigger.or(docked).first()).toBeVisible({ timeout: 15_000 });
  if (await trigger.isVisible()) {
    await trigger.click();
    return page.locator("dialog.sheet[open]");
  }
  return page.locator(".ticket-docked");
}

async function openCashCard(page: Page) {
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Cash", exact: true });
  await expect(rowValue(card, "Cash balance")).toBeVisible({ timeout: 15_000 });
  return card;
}

function rowValue(card: Locator, title: string) {
  return card
    .locator(".ar-row", { has: card.page().getByText(title, { exact: true }) })
    .locator(".ar-row__value");
}

/** "$10,000.00" → "10000.00" (canonical string, for exact cents math). */
async function readMoney(locator: Locator): Promise<string> {
  const text = (await locator.innerText()).trim();
  return text.replace(/[$,]/g, "");
}

const plus = (a: string, b: string) => centsToString(toCents(a) + toCents(b));
const minus = (a: string, b: string) => centsToString(toCents(a) - toCents(b));

test("add $1,000: the balance and Activity show the deposit", async ({ page }) => {
  await signUpWithAccount(page);
  const card = await openCashCard(page);
  const before = await readMoney(rowValue(card, "Cash balance"));

  await card.getByRole("button", { name: "Add cash" }).click();
  const sheet = page.getByRole("dialog", { name: "Add cash" });
  await expect(sheet.getByLabel("Amount", { exact: true })).toBeFocused();
  await sheet.getByRole("button", { name: "$1,000" }).click();
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("1000.00");
  await sheet.getByRole("button", { name: "Review" }).click();

  const after = plus(before, "1000.00");
  await expect(sheet.getByText("Simulated money. No real funds move.")).toBeVisible();
  await expect(
    sheet.locator(".ar-ticket-row", { hasText: "Cash after" }).locator(".ar-ticket-row__value"),
  ).toHaveText(formatMoney(after));
  await sheet.getByRole("button", { name: "Confirm deposit" }).click();

  await expect(sheet.getByRole("heading", { name: "Added $1,000.00" })).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(rowValue(card, "Cash balance")).toHaveText(formatMoney(after));

  await page.goto("/activity");
  await expect(page.getByText(formatSignedMoney("1000.00")).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("withdrawing more than is available is blocked before review", async ({ page }) => {
  await signUpWithAccount(page);
  const card = await openCashCard(page);
  const withdrawable = await readMoney(rowValue(card, "Available to withdraw"));

  await card.getByRole("button", { name: "Withdraw" }).click();
  const sheet = page.getByRole("dialog", { name: "Withdraw cash" });
  const amount = sheet.getByLabel("Amount", { exact: true });
  await amount.fill(plus(withdrawable, "0.01"));
  await expect(sheet.getByRole("alert")).toHaveText(
    `You can withdraw up to ${formatMoney(withdrawable)}.`,
  );
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByRole("button", { name: "Review" })).toBeDisabled();

  // Below the minimum is caught the same way; a valid amount clears it.
  await amount.fill("0.50");
  await expect(sheet.getByRole("alert")).toHaveText("The minimum transfer is $1.00.");
  await amount.fill("1,000");
  await expect(amount).toHaveValue("1000");
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Review" })).toBeEnabled();
});

test("a resting limit buy holds cash; Max respects it; a withdrawal lands in Activity", async ({
  page,
}) => {
  await signUpWithAccount(page);
  const card = await openCashCard(page);
  const cashBefore = await readMoney(rowValue(card, "Cash balance"));
  expect(await readMoney(rowValue(card, "Available to withdraw"))).toBe(cashBefore);

  // Non-marketable limit buy: 10 AAPL @ 150 (fixture last = 200) reserves $1,500.
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await ticket
    .getByRole("group", { name: "Order type" })
    .getByRole("button", { name: "Limit (day)" })
    .click();
  await ticket.getByLabel("Quantity (whole shares)").fill("10");
  await ticket.getByLabel("Limit price").fill("150");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Open", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  const card2 = await openCashCard(page);
  const expectedWithdrawable = minus(cashBefore, "1500.00");
  await expect(rowValue(card2, "Cash balance")).toHaveText(formatMoney(cashBefore));
  await expect(rowValue(card2, "Available to withdraw")).toHaveText(
    formatMoney(expectedWithdrawable),
  );
  await expect(card2.getByText("$1,500.00 is held now", { exact: false })).toBeVisible();

  await card2.getByRole("button", { name: "Withdraw" }).click();
  const sheet = page.getByRole("dialog", { name: "Withdraw cash" });
  const amount = sheet.getByLabel("Amount", { exact: true });
  await sheet.getByRole("button", { name: "Max" }).click();
  await expect(amount).toHaveValue(expectedWithdrawable);
  await expect(sheet.getByRole("button", { name: "Review" })).toBeEnabled();

  // Withdraw an allowed amount.
  await amount.fill("1000");
  await sheet.getByRole("button", { name: "Review" }).click();
  await expect(
    sheet.locator(".ar-ticket-row", { hasText: "Cash after" }).locator(".ar-ticket-row__value"),
  ).toHaveText(formatMoney(minus(cashBefore, "1000.00")));
  await sheet.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(sheet.getByRole("heading", { name: "Withdrew $1,000.00" })).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(rowValue(card2, "Cash balance")).toHaveText(
    formatMoney(minus(cashBefore, "1000.00")),
  );
  await expect(rowValue(card2, "Available to withdraw")).toHaveText(
    formatMoney(minus(expectedWithdrawable, "1000.00")),
  );

  await page.goto("/activity");
  await expect(page.getByText(formatSignedMoney("-1000.00")).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("settings with the cash sheet open has no serious a11y violations", async ({ page }) => {
  await signUpWithAccount(page);
  const card = await openCashCard(page);
  await card.getByRole("button", { name: "Add cash" }).click();
  const sheet = page.getByRole("dialog", { name: "Add cash" });
  await sheet.getByLabel("Amount", { exact: true }).fill("0.5");
  await expect(sheet.getByRole("alert")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
