import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, signUp } from "./helpers";

/**
 * Markets discovery (fixtures; the Top 100 serves its seed — the ranking job
 * is disabled offline): browse cards → a list → an instrument, day change on
 * both, search with its no-match and failure states, list paging (and a page
 * that fails to load), and both screens pass axe. Both viewports.
 */

test("browse: Top 100 and sectors, into a list, onto an instrument", async ({ page }) => {
  await signUp(page, { tag: "e2e-disc" });
  await page.goto("/markets");

  const browse = page.getByRole("region", { name: "Browse" });
  const top100 = browse.getByRole("link", { name: /^Top 100/ });
  await expect(top100).toBeVisible();
  // Top 100 + 11 sectors (Top movers' instrument rows sit between them)
  await expect(browse.locator('a.browse-featured, a.ar-row[href^="/markets/s/"]')).toHaveCount(12);
  await expect(browse.getByRole("region", { name: "Top movers" })).toBeVisible();
  await expect(browse.getByRole("link", { name: /^Technology\s+10 companies/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: "light" });

  // Top 100: ranked, paged 25 at a time, dated.
  await top100.click();
  await expect(page.getByRole("heading", { name: "Top 100" })).toBeVisible();
  await expect(page.getByText(/Ranked by market value · updated/)).toBeVisible();
  const rows = page.locator("ul.ar-list > li");
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText("Rank 1");
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(50);
  await expect(rows.nth(25)).toContainText("Rank 26");
  await expectNoSeriousA11yViolations(page);

  // A sector: prices with a signed day change and a freshness chip.
  await page.goto("/markets/s/technology");
  await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible();
  const aapl = page.getByRole("link", { name: /^AAPL/ });
  await expect(aapl).toContainText("$200.00");
  await expect(aapl).toContainText(/[+−]\$\d/);
  await expect(page.getByText(/fixture/).first()).toBeVisible();

  // Into the instrument: its header carries the same day change.
  await aapl.click();
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
  await expect(
    page.locator("header").getByText(/[+−]\$\d+\.\d\d \([+−]\d+\.\d\d%\)/),
  ).toBeVisible();

  // Back chevron returns to Search.
  await page.goBack();
  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
});

test("key stats: market cap, P/E, 52-week range, and n/m for a loss", async ({ page }) => {
  await signUp(page, { tag: "e2e-disc" });
  await page.goto("/i/AAPL");
  const stats = page.getByRole("region", { name: "Stats" });
  await expect(stats.getByText("$2.92T")).toBeVisible(); // 14.59B × $200
  await expect(stats.getByText("P/E ratio (TTM)")).toBeVisible();
  await expect(stats.getByText("25.3")).toBeVisible(); // $200 ÷ $7.90
  await expect(stats.getByText("52w high")).toBeVisible();
  await expect(stats.getByText(/^\$\d{3}\.\d\d$/).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.goto("/i/TSLA"); // fixture EPS is negative
  await expect(
    page.getByRole("region", { name: "Stats" }).locator(".ar-stat__value", { hasText: /^n\/m/ }),
  ).toBeVisible();
});

test("search: results replace browse, no-match teaches, a failure retries", async ({ page }) => {
  await signUp(page, { tag: "e2e-disc" });
  await page.goto("/markets");
  await expect(page.getByRole("region", { name: "Browse" })).toBeVisible();
  const field = page.getByLabel("Search US equities");

  await field.fill("AAPL");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByRole("link", { name: /^AAPL/ })).toBeVisible();
  await expect(results.getByRole("status")).toHaveText(/\d+ results?/);
  await expect(page.getByRole("region", { name: "Browse" })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // No match: never shown before the search for what's typed has answered.
  await field.fill("zzqx");
  await expect(results.getByText("No matches for “zzqx”")).toBeVisible();
  await expect(results.getByText(/Try a ticker/)).toBeVisible();

  // A failed search is an error with a retry — not "No matches".
  await page.route("**/api/v1/instruments?**", (r) => r.fulfill({ status: 500, body: "{}" }));
  await field.fill("MSFT");
  const failure = results.getByRole("alert").filter({ hasText: "Search isn't available" });
  await expect(failure).toContainText("Search isn't available right now.");
  await expect(results.getByText(/No matches/)).toHaveCount(0);
  await page.unrouteAll();
  await failure.getByRole("button", { name: "Try again" }).click();
  await expect(results.getByRole("link", { name: /^MSFT/ })).toBeVisible();

  // Clearing brings Browse back.
  await field.fill("");
  await expect(page.getByRole("region", { name: "Browse" })).toBeVisible();
});

test("browse and list failures: retry, keep loaded rows, unknown lists say so", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-disc" });

  // Browse unavailable → retry.
  await page.route("**/api/v1/browse", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.goto("/markets");
  const browseError = page
    .getByRole("region", { name: "Browse" })
    .getByRole("alert")
    .filter({ hasText: "Browsing is unavailable" });
  await expect(browseError).toContainText("Browsing is unavailable");
  await page.unrouteAll();
  await browseError.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /^Top 100/ })).toBeVisible();

  // "Show more" failing keeps the 25 loaded rows and says so; retry loads them.
  await page.goto("/markets/s/top-100");
  const rows = page.locator("ul.ar-list > li");
  await expect(rows).toHaveCount(25);
  await page.route("**/api/v1/browse/top-100?page=1", (r) =>
    r.fulfill({ status: 500, body: "{}" }),
  );
  const moreError = page.getByRole("alert").filter({ hasText: "couldn't be loaded" });
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(moreError).toBeVisible();
  await expect(rows).toHaveCount(25);
  await page.unrouteAll();
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(50);
  await expect(moreError).toHaveCount(0);

  // A list that fails outright offers a retry.
  await page.route("**/api/v1/browse/energy?**", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.goto("/markets/s/energy");
  const listError = page.getByRole("alert").filter({ hasText: "unavailable right now" });
  await expect(listError).toContainText("unavailable right now");
  await page.unrouteAll();
  await listError.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Energy" })).toBeVisible();

  // Unknown list.
  await page.goto("/markets/s/not-a-sector");
  await expect(page.getByRole("heading", { name: "List not found" })).toBeVisible();
  await expect(page.getByText("This list doesn't exist.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  // the empty state's own way back (the app bar's chevron is the other)
  await page.getByRole("link", { name: "Back to search" }).last().click();
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
});
