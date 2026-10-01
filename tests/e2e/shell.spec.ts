import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, signUp } from "./helpers";

/**
 * The app shell and the Portfolio / Activity screens (deterministic broker +
 * fixtures): navigation current states, the mode ribbon, the pipeline status
 * banner, theme persistence, 404, and each screen's content, empty, error and
 * paging states. Both viewport projects run it; axe scans in both themes.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** No sideways page scroll — long row titles must truncate, not widen the page. */
async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

/** The visible primary navigation: the sidebar ≥ 768px, the tab bar below. */
const primaryNav = (page: Page) =>
  page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });

async function placeMarketOrder(page: Page, symbol: string, side: "BUY" | "SELL", qty: number) {
  const res = await page.request.post("/api/v1/orders", {
    data: { symbol, side, type: "MARKET", qty, idempotencyKey: crypto.randomUUID() },
  });
  expect(res.status()).toBe(201);
}

const degraded = {
  market: { status: "OPEN", asOf: new Date().toISOString() },
  broker: { pipeline: "DELAYED", lastSyncAt: new Date(Date.now() - 10 * 60_000).toISOString() },
};

test("navigation marks the current destination, Search included", async ({ page }) => {
  await signUp(page, { tag: "e2e-shell" });
  const nav = primaryNav(page);
  await expect(nav).toHaveCount(1);

  const cases: Array<[string, string]> = [
    ["/", "Dashboard"],
    ["/portfolio", "Portfolio"],
    ["/markets", "Search"],
    ["/i/AAPL", "Search"], // an instrument belongs to Search, where it is found
    ["/orders", "Orders"],
    ["/activity", "Activity"],
  ];
  for (const [path, label] of cases) {
    await page.goto(path);
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  }

  // Settings: the sidebar item on wide screens, the top-bar icon on phones.
  await page.goto("/settings");
  const settings = isMobile(page)
    ? page.locator(".mobile-top-bar").getByRole("link", { name: "Settings" })
    : nav.getByRole("link", { name: "Settings" });
  await expect(settings).toHaveAttribute("aria-current", "page");
  if (isMobile(page)) {
    // The phone top bar carries the brand, the search shortcut and Settings.
    const bar = page.locator(".mobile-top-bar");
    await expect(bar.getByRole("link", { name: "Search markets" })).toBeVisible();
  }

  // The practice ribbon is on every screen, auth and 404 included.
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
  await page.goto("/no-such-page");
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
});

test("404: a designed page with a way back", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/signin$/); // signed out → the dashboard asks for sign-in
});

test("status banner: shown while the pipeline is degraded, never in live preview", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-shell" });
  const banner = page.locator(".status-banner");
  await expect(banner).toHaveCount(0); // deterministic pipeline is live

  await page.route("**/api/v1/system/status", (route) => route.fulfill({ json: degraded }));
  await page.goto("/portfolio");
  await expect(banner).toHaveRole("status");
  await expect(banner).toContainText("Order updates may be delayed; last sync 10m ago");
  await expect(page.getByRole("region", { name: "Summary" })).toBeVisible(); // settled
  await expectNoSeriousA11yViolations(page);

  // The status endpoint itself failing is said too — never silently "live".
  await page.route("**/api/v1/system/status", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "INTERNAL", message: "down", requestId: "t" } },
    }),
  );
  await page.reload();
  await expect(banner).toContainText("System status unavailable", { timeout: 15_000 });

  // Live preview has no orders: the paper pipeline's banner stays out of it.
  await page.route("**/api/v1/system/status", (route) => route.fulfill({ json: degraded }));
  await page.evaluate(() => localStorage.setItem("trading-mode", "live"));
  await page.reload();
  await expect(page.getByRole("note", { name: "Live trading notice" })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("trading-mode"));
});

test("theme: the choice applies at once and survives reloads and navigation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signUp(page, { tag: "e2e-shell", openAccount: false });
  await expect(page.getByLabel("Starting cash")).toBeVisible({ timeout: 15_000 }); // signed in, landed
  await page.goto("/settings");
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: "Theme: Light" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
  await page.goto("/activity");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Theme: Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("portfolio: equity, insights, holdings, and the phone's two-line rows", async ({ page }) => {
  await signUp(page, { tag: "e2e-shell" });

  // No positions yet: a teaching empty state with one action.
  await page.goto("/portfolio");
  await expect(page.getByText("No positions")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Search markets" })).toBeVisible();

  await placeMarketOrder(page, "AAPL", "BUY", 3);
  await placeMarketOrder(page, "MSFT", "BUY", 1);
  await page.reload();

  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByText("Equity")).toBeVisible();
  await expect(page.getByText("Valuations as of")).toBeVisible(); // freshness context
  for (const label of ["Cash", "Positions value", "Realized P&L"]) {
    await expect(page.locator(".ar-insight").filter({ hasText: label })).toBeVisible();
  }

  const table = page.getByRole("table", { name: "Positions" });
  const aapl = table.getByRole("row").filter({ hasText: "AAPL" });
  await expect(aapl).toContainText("3 shares");
  await expect(table.getByRole("row").filter({ hasText: "MSFT" })).toContainText("1 share");

  // Avg cost / Last are wide-screen columns; phones read symbol + qty / value + P&L.
  const avgCost = aapl.locator('td[data-cell="wide"]').first();
  if (isMobile(page)) await expect(avgCost).toBeHidden();
  else await expect(avgCost).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "light" });

  await aapl.getByRole("link", { name: "AAPL" }).click();
  await expect(page).toHaveURL(/\/i\/AAPL$/);
});

test("portfolio: no account points to onboarding; a failed load offers a retry", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-shell", openAccount: false });
  await expect(page.getByLabel("Starting cash")).toBeVisible({ timeout: 15_000 }); // signed in, landed
  await page.goto("/portfolio");
  await expect(page.getByText("No practice account yet")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/could not be loaded/)).toHaveCount(0);
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page.getByLabel("Starting cash")).toBeVisible();
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });

  let fail = true;
  await page.route("**/api/v1/portfolio", (route) =>
    fail
      ? route.fulfill({
          status: 500,
          json: { error: { code: "INTERNAL", message: "boom", requestId: "t" } },
        })
      : route.fallback(),
  );
  await page.goto("/portfolio");
  const error = page.getByRole("alert").filter({ hasText: "Portfolio could not be loaded." });
  await expect(error).toBeVisible({ timeout: 15_000 });
  fail = false;
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
});

test("activity: day groups, semantic chips, signed amounts", async ({ page }) => {
  await signUp(page, { tag: "e2e-shell" });
  await placeMarketOrder(page, "AAPL", "BUY", 2);
  await placeMarketOrder(page, "AAPL", "SELL", 1);

  await page.goto("/activity");
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByText(/^Sold 1 AAPL/)).toBeVisible({ timeout: 15_000 });

  const row = (text: RegExp) => today.getByRole("listitem").filter({ hasText: text });
  // Deposit: gain chip + arrow-down-left, "+" amount.
  await expect(row(/Opening deposit/).locator(".ar-chipicon--gain")).toHaveCount(1);
  await expect(row(/Opening deposit/)).toContainText("+$10,000.00");
  // Trades: the Stocks chip; a buy is money out (−), a sell money in (+).
  await expect(row(/^Bought 2 AAPL/).locator(".ar-chipicon--stocks")).toHaveCount(1);
  await expect(row(/^Bought 2 AAPL/)).toContainText("−$");
  await expect(row(/^Sold 1 AAPL/)).toContainText("+$");

  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(page);
});

/** A synthetic ledger page (the UI's paging, not the server's, is under test here). */
function ledgerPage(prefix: string, count: number, nextCursor: string | null) {
  return {
    nextCursor,
    entries: Array.from({ length: count }, (_, i) => ({
      id: `${prefix}-${i}`,
      type: i % 3 === 0 ? "WITHDRAWAL" : i % 3 === 1 ? "FEE" : "DEPOSIT",
      amount: i % 3 === 2 ? "25.00" : "-1.50",
      description: `${prefix} entry ${i}`,
      refType: null,
      refId: null,
      archived: false,
      createdAt: new Date(Date.UTC(2026, 0, prefix === "new" ? 20 : 10, 15, 0, i)).toISOString(),
    })),
  };
}

test("activity: older pages load on request; a failed page keeps what is shown", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-shell" });
  let olderFails = true;
  await page.route("**/api/v1/ledger*", (route) => {
    const before = new URL(route.request().url()).searchParams.get("before");
    if (!before) return route.fulfill({ json: ledgerPage("new", 50, "new-49") });
    if (olderFails) {
      return route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL", message: "boom", requestId: "t" } },
      });
    }
    return route.fulfill({ json: ledgerPage("old", 3, null) });
  });

  await page.goto("/activity");
  await expect(page.getByText("new entry 49")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Jan 20, 2026" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // Withdrawal and fee: loss chips with arrow-up-right.
  await expect(
    page.getByRole("listitem").filter({ hasText: "new entry 0" }).locator(".ar-chipicon--loss"),
  ).toHaveCount(1);

  const older = page.getByRole("button", { name: "Show older activity" });
  await older.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Older activity could not be loaded" }),
  ).toBeVisible();
  await expect(page.getByText("new entry 49")).toBeVisible(); // nothing replaced

  olderFails = false;
  await older.click();
  await expect(page.getByText("old entry 2")).toBeVisible();
  await expect(page.getByRole("region", { name: "Jan 10, 2026" })).toBeVisible();
  await expect(older).toHaveCount(0); // the last page
  await expect(page.getByText("Older activity could not be loaded")).toHaveCount(0);
});

test("activity: a failed first load offers a retry", async ({ page }) => {
  await signUp(page, { tag: "e2e-shell" });
  let fail = true;
  await page.route("**/api/v1/ledger*", (route) =>
    fail
      ? route.fulfill({
          status: 500,
          json: { error: { code: "INTERNAL", message: "boom", requestId: "t" } },
        })
      : route.fallback(),
  );
  await page.goto("/activity");
  const error = page.getByRole("alert").filter({ hasText: "Activity could not be loaded." });
  await expect(error).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Show older activity" })).toHaveCount(0);
  fail = false;
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Opening deposit")).toBeVisible();
});
