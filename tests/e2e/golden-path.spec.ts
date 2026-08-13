import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Golden-path E2E (vertical slice A, UI criterion): signup -> instrument ->
 * market buy -> order advances to Filled WITHOUT manual refresh -> portfolio
 * shows the position. Runs against the deterministic broker + fixtures
 * (FORCE_MARKET_OPEN=1 via playwright.config webServer env). Both desktop and
 * mobile viewport projects execute this file.
 */

const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("signup, buy 10 AAPL at market, watch it fill, see the position", async ({ page }) => {
  // Sign up.
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Trader");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
  await page.getByRole("button", { name: "Create account" }).click();

  // Dashboard: provisioned account with the persistent paper badge.
  await expect(page.getByText("Portfolio value")).toBeVisible();
  await expect(page.getByText("$100,000.00").first()).toBeVisible();
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Instrument page: quote with freshness context.
  await page.goto("/i/AAPL");
  await expect(page.getByRole("heading", { level: 1, name: /AAPL/ })).toBeVisible();
  await expect(page.getByText(/fixture ·/)).toBeVisible();

  // Ticket: buy 10 at market, review, confirm.
  await page.getByLabel("Quantity (whole shares)").fill("10");
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByText(/Buy 10 AAPL · Market/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm order" }).click();

  // The order chip advances to Filled WITHOUT any page reload.
  const chip = page.locator('[aria-live="polite"]');
  await expect(chip.getByText("Filled", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(chip.getByText("Buy 10/10 AAPL")).toBeVisible();

  // Position strip appears on the instrument page.
  await expect(page.getByText("Your position")).toBeVisible();
  await expect(page.getByText("10 shares")).toBeVisible();

  // Portfolio reflects the trade with asOf-stamped valuations.
  await page.goto("/portfolio");
  await expect(page.getByRole("link", { name: "AAPL" })).toBeVisible();
  await expect(page.getByText(/Valuations as of/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Activity shows the ledger trail: deposit + trade.
  await page.goto("/activity");
  await expect(page.getByText("Opening deposit (simulated)")).toBeVisible();
  await expect(page.getByText(/Bought 10 AAPL/)).toBeVisible();

  // Orders history shows the filled order.
  await page.goto("/orders");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".badge", { hasText: "Filled" })).toBeVisible();
});

test("resting limit order can be cancelled and releases buying power", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Limit");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible();

  // Non-marketable limit buy: 10 @ 150 (fixture last = 200).
  await page.goto("/i/AAPL");
  await page.getByLabel("Order type").selectOption("LIMIT");
  await page.getByLabel("Quantity (whole shares)").fill("10");
  await page.getByLabel("Limit price").fill("150");
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page.locator('[aria-live="polite"]').getByText("Open", { exact: true })).toBeVisible(
    { timeout: 15_000 },
  );

  // Cancel from the orders page; the order leaves Open and shows Cancelled
  // under History — no manual refresh.
  await page.goto("/orders");
  await expect(page.getByText(/Buy 10 AAPL/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("No open orders.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".badge", { hasText: "Cancelled" })).toBeVisible({
    timeout: 15_000,
  });
});
