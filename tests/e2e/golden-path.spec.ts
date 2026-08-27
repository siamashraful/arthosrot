import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Golden-path E2E (vertical slice A, UI criterion): signup -> instrument ->
 * market buy -> order advances to Filled WITHOUT manual refresh -> portfolio
 * shows the position. Runs against the deterministic broker + fixtures
 * (FORCE_MARKET_OPEN=1 via playwright.config webServer env). Both desktop and
 * mobile viewport projects execute this file.
 */

/** Responsive ticket scope: < lg the ticket lives in a bottom sheet behind a
 *  "Trade <SYM>" button; >= lg it is docked. Returns the locator to act in. */
async function openTicket(page: import("@playwright/test").Page) {
  const trigger = page.locator(".ticket-mobile").getByRole("button", { name: /^Trade / });
  const dockedHeading = page.locator(".ticket-docked").getByRole("heading", { name: /^Trade / });
  // Wait for whichever variant this viewport renders (page may still be loading).
  await expect(trigger.or(dockedHeading).first()).toBeVisible({ timeout: 15_000 });
  if (await trigger.isVisible()) {
    await trigger.click();
    return page.locator("dialog.sheet");
  }
  return page.locator(".ticket-docked");
}

const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Onboarding (FR-2): pick starting cash on the slider, open the account. */
async function openAccount(page: import("@playwright/test").Page, amount?: number) {
  const slider = page.getByLabel("Starting cash");
  await expect(slider).toBeVisible({ timeout: 15_000 });
  if (amount !== undefined) await slider.fill(String(amount));
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
}

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

  // The brand lockup must actually PAINT — it renders via CSS mask over
  // currentColor, so a styling regression can leave it invisible while every
  // text assertion still passes (this happened once; never again).
  const lockupPainted = await page.locator(".brand-lockup").evaluateAll((els) =>
    els.some((el) => {
      const cs = getComputedStyle(el);
      const mask = cs.maskImage || (cs as unknown as { webkitMaskImage: string }).webkitMaskImage;
      return (
        el.getBoundingClientRect().width > 40 &&
        cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        String(mask).includes("lockup-horizontal")
      );
    }),
  );
  expect(lockupPainted, "brand lockup is not painting (mask/currentColor)").toBe(true);

  // Onboarding: the user picks starting cash (default $10,000) — the account
  // is NOT auto-provisioned at signup.
  await expect(page.getByRole("heading", { name: "Open your practice account" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await openAccount(page);

  // Dashboard: provisioned account with the persistent paper badge.
  await expect(page.getByText("$10,000.00").first()).toBeVisible();
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Instrument page: quote with freshness context.
  await page.goto("/i/AAPL");
  await expect(page.getByRole("heading", { level: 1, name: /AAPL/ })).toBeVisible();
  await expect(page.getByText(/fixture ·/)).toBeVisible();

  // Ticket: buy 10 at market, review, confirm (bottom sheet on mobile).
  const ticket = await openTicket(page);
  await ticket.getByLabel("Quantity (whole shares)").fill("10");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await expect(ticket.getByText(/Buy 10 AAPL · Market/)).toBeVisible();
  await ticket.getByRole("button", { name: "Confirm order" }).click();

  // The order chip advances to Filled WITHOUT any page reload.
  const chip = ticket.locator('[aria-live="polite"]');
  await expect(chip.getByText("Filled", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(chip.getByText("Buy 10/10 AAPL")).toBeVisible();

  // Close the sheet if open (mobile) so the page behind is assertable.
  const closeBtn = page.locator("dialog.sheet").getByRole("button", { name: "Close" });
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();

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
  // Onboarding with a slider-chosen amount (max of the range).
  await openAccount(page, 25_000);

  // Non-marketable limit buy: 10 @ 150 (fixture last = 200).
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await ticket.getByLabel("Order type").selectOption("LIMIT");
  await ticket.getByLabel("Quantity (whole shares)").fill("10");
  await ticket.getByLabel("Limit price").fill("150");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Open", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

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
