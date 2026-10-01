import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, openTicket, signUp } from "./helpers";

/**
 * Golden-path E2E (vertical slice A, UI criterion): signup -> instrument ->
 * market buy -> order advances to Filled WITHOUT manual refresh -> portfolio
 * shows the position. Runs against the deterministic broker + fixtures
 * (FORCE_MARKET_OPEN=1 via playwright.config webServer env). Both desktop and
 * mobile viewport projects execute this file.
 */

/** Onboarding (FR-2): pick starting cash on the slider, open the account. */
async function openAccount(page: Page, amount?: number) {
  const slider = page.getByLabel("Starting cash");
  await expect(slider).toBeVisible({ timeout: 15_000 });
  if (amount !== undefined) await slider.fill(String(amount));
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
}

test("signup, buy 10 AAPL at market, watch it fill, see the position", async ({ page }) => {
  // Sign up (the account is opened below, on the onboarding screen).
  await signUp(page, { name: "E2E Trader", openAccount: false });

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
  // Computed styles report the mask URL whether or not the asset resolved —
  // fetch it so a renamed/404'd SVG cannot pass the paint check silently.
  const maskAsset = await page.request.get("/brand/lockup-horizontal.svg");
  expect(maskAsset.ok(), "lockup mask asset does not resolve").toBe(true);

  // Onboarding: the user picks starting cash (default $10,000) — the account
  // is NOT auto-provisioned at signup.
  await expect(page.getByRole("heading", { name: "Open your practice account" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await openAccount(page);

  // Dashboard: provisioned account with the persistent paper badge.
  await expect(page.getByText("$10,000.00").first()).toBeVisible();
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
  // Net-worth module: range tabs + the delta line. A minutes-old account
  // charts its deposit event and the live tail — a flat, honest $0.00 delta
  // (history clips to account creation; nothing is backfilled).
  await expect(page.getByRole("tablist", { name: "Net worth range" })).toBeVisible();
  await expect(page.getByText("past month", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expectNoSeriousA11yViolations(page);

  // Instrument page: quote with freshness context.
  await page.goto("/i/AAPL");
  await expect(page.getByRole("heading", { level: 1, name: /AAPL/ })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .locator("header")
      .getByText(/fixture ·/),
  ).toBeVisible();

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
  await expect(page.locator(".ar-tag", { hasText: "Filled" })).toBeVisible();
});

test("resting limit order can be cancelled and releases buying power", async ({ page }) => {
  // Onboarding with a slider-chosen amount (max of the range).
  await signUp(page, { name: "E2E Limit", startingCash: 25_000 });

  // Non-marketable limit buy: 10 @ 150 (fixture last = 200).
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

  // Cancel from the orders page; the order leaves Open and shows Cancelled
  // under History — no manual refresh.
  await page.goto("/orders");
  await expect(page.getByText(/Buy 10 AAPL/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("No open orders.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".ar-tag", { hasText: "Cancelled" })).toBeVisible({
    timeout: 15_000,
  });
});
