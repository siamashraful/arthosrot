import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, signUp } from "./helpers";

/**
 * Top movers (Search page, empty query) and the watchlist's sparkline rows
 * (dashboard). Fixture feed + FORCE_MARKET_OPEN (playwright.config.ts): day
 * changes are the fixture's seeded ±2% moves, so both sides have movers.
 */

test("Search: top movers switch between gainers and losers and link to instruments", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-movers" });
  await page.goto("/markets");

  const movers = page.getByRole("region", { name: "Top movers" });
  await expect(movers).toBeVisible({ timeout: 15_000 });
  const gainersBtn = movers.getByRole("button", { name: "Gainers" });
  const losersBtn = movers.getByRole("button", { name: "Losers" });
  await expect(gainersBtn).toHaveAttribute("aria-pressed", "true");
  await expect(losersBtn).toHaveAttribute("aria-pressed", "false");

  // Gainers: up to five rows, each a price with an up move, plus one chip.
  const gainers = movers.getByRole("list", { name: "Top gainers" }).getByRole("link");
  await expect(gainers.first()).toBeVisible();
  expect(await gainers.count()).toBeLessThanOrEqual(5);
  await expect(gainers.first()).toContainText(/\$\d/);
  await expect(gainers.first()).toContainText(/\+\$\d/);
  await expect(gainers.first()).toContainText(/today|last session/);
  await expect(movers.getByText(/fixture/).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Losers: the other side, down moves.
  await losersBtn.click();
  await expect(losersBtn).toHaveAttribute("aria-pressed", "true");
  const losers = movers.getByRole("list", { name: "Top losers" }).getByRole("link");
  await expect(losers.first()).toBeVisible();
  expect(await losers.count()).toBeLessThanOrEqual(5);
  await expect(losers.first()).toContainText(/−\$\d/);

  // A row opens its instrument page.
  const href = (await losers.first().getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/i\/[A-Z.]+$/);
  const symbol = decodeURIComponent(href.slice("/i/".length));
  await losers.first().click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(".", "\\.")}$`));
  await expect(page.getByRole("heading", { level: 1, name: symbol })).toBeVisible();
});

test("Dashboard: watchlist rows show price, day change, a sparkline and stay removable", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-watch" });
  for (const symbol of ["AAPL", "MSFT"]) {
    await page.goto(`/i/${symbol}`);
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();
  }

  await page.goto("/");
  const watchlist = page.getByRole("region", { name: "Watchlist" });
  const aapl = watchlist.getByRole("link", { name: /^AAPL/ });
  await expect(aapl).toContainText("$200.00", { timeout: 15_000 });
  await expect(aapl).toContainText(/[+−]\$\d/);
  // the list's one freshness chip
  await expect(watchlist.getByText(/fixture/).first()).toBeVisible();
  // the session sparkline: decorative, in the row on wide screens; phones
  // (< 480px) give its slot to the symbol, name and price
  const spark = aapl.locator("svg.ar-spark");
  await expect(spark).toHaveAttribute("aria-hidden", "true");
  if ((page.viewportSize()?.width ?? 0) >= 480) await expect(spark).toBeVisible();
  else await expect(spark).toBeHidden();
  await expectNoSeriousA11yViolations(page);

  // The remove button still removes exactly one row.
  await watchlist.getByRole("button", { name: "Remove MSFT from watchlist" }).click();
  await expect(watchlist.getByRole("link", { name: /^MSFT/ })).toHaveCount(0);
  await expect(aapl).toBeVisible();
});
