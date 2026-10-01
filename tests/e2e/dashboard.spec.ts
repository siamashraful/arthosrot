import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, openTicket, signUp } from "./helpers";

/**
 * Dashboard (deterministic broker + fixtures; both viewport projects): the
 * hero, account tiles, net-worth ranges and teaching empty states on a fresh
 * account; a trade and a watchlist add made elsewhere showing up WITHOUT a
 * reload (shared query keys + invalidation); per-row watchlist remove; and
 * every panel's failure state offering a working retry.
 */

/** The primary nav's Dashboard link — sidebar on desktop, tab bar on phones. */
function dashboardNavLink(page: Page) {
  return page
    .getByRole("navigation", { name: "Primary" })
    .filter({ visible: true })
    .getByRole("link", { name: "Dashboard", exact: true });
}

test("fresh account: hero, tiles, net-worth ranges, empty states, light and dark", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-dash" });

  const hero = page.getByRole("region", { name: "Account summary" });
  await expect(hero.getByText("$10,000.00")).toBeVisible();
  // the as-of line names the session in words, never a raw enum
  await expect(
    hero.getByText(/as of .+ · (Market open|Market closed|Pre-market|After hours)/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Stocks\s*\$0\.00\s*Invested/ })).toBeVisible();

  // Net-worth ranges: the readout follows the selected range.
  const ranges = page.getByRole("tablist", { name: "Net worth range" });
  await expect(ranges.getByRole("tab", { name: "1M" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/past month/)).toBeVisible();
  await ranges.getByRole("tab", { name: "1W" }).click();
  await expect(ranges.getByRole("tab", { name: "1W" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/past week/)).toBeVisible();
  await ranges.getByRole("tab", { name: "ALL" }).click();
  await expect(page.getByText(/all time/)).toBeVisible();

  // Teaching empty states, each with its way forward.
  await expect(page.getByText("No positions yet")).toBeVisible();
  await expect(
    page.locator(".ar-empty").getByRole("link", { name: "Search markets" }),
  ).toHaveAttribute("href", "/markets");
  const watchlist = page.getByRole("region", { name: "Watchlist" });
  await expect(watchlist.getByText(/to track them here/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Open orders" }).getByText("No open orders."),
  ).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "light" });

  // Hero pill → Search.
  await hero.getByRole("link", { name: "Trade" }).click();
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
});

test("a trade and watchlist adds made elsewhere show on the dashboard without a reload", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-dash" });
  await expect(page.getByText("No positions yet")).toBeVisible();

  // Search → result → instrument (client-side navigation keeps the cache).
  await page
    .getByRole("region", { name: "Account summary" })
    .getByRole("link", { name: "Trade" })
    .click();
  await page.getByLabel("Search US equities").fill("AAPL");
  await page
    .getByRole("region", { name: "Search results" })
    .getByRole("link", { name: /^AAPL/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "AAPL" })).toBeVisible();

  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();

  const ticket = await openTicket(page);
  await ticket.getByLabel("Quantity (whole shares)").fill("1");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Filled", { exact: true }),
  ).toBeVisible();
  const closeBtn = page.locator("dialog.sheet").getByRole("button", { name: "Close" });
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();

  // Second watchlist symbol, so remove can be shown to touch one row only.
  await page.goto("/i/MSFT");
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();

  await dashboardNavLink(page).click();
  const positions = page.getByRole("region", { name: "Top positions" });
  const aaplPosition = positions.getByRole("link", { name: /^AAPL/ });
  await expect(aaplPosition).toBeVisible();
  await expect(aaplPosition).toContainText("1 share");
  await expect(page.getByText("No positions yet")).toHaveCount(0);

  // Watchlist rows: symbol + name, price and the day change; the list's one
  // freshness chip (in the section header) carries the time context.
  const watchlist = page.getByRole("region", { name: "Watchlist" });
  const aaplWatch = watchlist.getByRole("link", { name: /AAPL/ });
  await expect(aaplWatch).toContainText("$200.00");
  await expect(aaplWatch).toContainText(/[+−]\$\d/);
  await expect(watchlist.getByText(/fixture · |At close · fixture/).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await watchlist.getByRole("button", { name: "Remove MSFT from watchlist" }).click();
  await expect(watchlist.getByRole("link", { name: /MSFT/ })).toHaveCount(0);
  await expect(aaplWatch).toBeVisible();
});

test("each dashboard panel's failure offers a retry that recovers", async ({ page }) => {
  await signUp(page, { tag: "e2e-dash" });

  // Account summary + watchlist fail together; retry each once the API is back.
  await page.route("**/api/v1/portfolio", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.route("**/api/v1/watchlist", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.reload();
  const summaryError = page
    .getByRole("alert")
    .filter({ hasText: "account summary couldn't be loaded" });
  const watchError = page.getByRole("alert").filter({ hasText: "watchlist couldn't be loaded" });
  await expect(summaryError).toBeVisible();
  await expect(watchError).toBeVisible();
  // an outage must never read as "nothing on your watchlist"
  await expect(page.getByText(/to track them here/)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  await page.unrouteAll();
  await summaryError.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("region", { name: "Account summary" })).toBeVisible();
  // The watchlist's own 15s poll can recover it first on a slow run (the axe
  // scan above takes a while); retry only while the error is still shown.
  const watchRetry = watchError.getByRole("button", { name: "Try again" });
  if (await watchRetry.isVisible()) await watchRetry.click();
  await expect(page.getByText(/to track them here/)).toBeVisible();

  // The account itself failing to load is an error, not an endless skeleton.
  await page.route("**/api/v1/me", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.reload();
  const meError = page.getByRole("alert").filter({ hasText: "Your account couldn't be loaded." });
  await expect(meError).toBeVisible();
  await page.unrouteAll();
  await meError.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible();
});
