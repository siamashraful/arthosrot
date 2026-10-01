import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Markets discovery (fixtures; the Top 100 serves its seed — the ranking job
 * is disabled offline): browse cards → a list → an instrument, day change on
 * both, search still works, and both screens pass axe. Both viewports.
 */

const email = () => `e2e-disc-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Discover");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("browse: Top 100 and sectors, into a list, onto an instrument", async ({ page }) => {
  await signUp(page);
  await page.goto("/markets");

  const browse = page.getByRole("region", { name: "Browse" });
  const top100 = browse.getByRole("link", { name: /^Top 100/ });
  await expect(top100).toBeVisible({ timeout: 15_000 });
  await expect(browse.getByRole("link")).toHaveCount(12); // Top 100 + 11 sectors
  await expect(browse.getByRole("link", { name: /^Technology\s+10 companies/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Top 100: ranked, paged 25 at a time, dated.
  await top100.click();
  await expect(page.getByRole("heading", { name: "Top 100" })).toBeVisible();
  await expect(page.getByText(/Ranked by market value · updated/)).toBeVisible();
  const rows = page.locator("ul.ar-list > li");
  await expect(rows).toHaveCount(25, { timeout: 15_000 });
  await expect(rows.first()).toContainText("Rank 1");
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(50);
  await expect(rows.nth(25)).toContainText("Rank 26");
  await expectNoSeriousA11yViolations(page);

  // A sector: prices with a signed day change and a freshness chip.
  await page.goto("/markets/s/technology");
  await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 15_000 });
  const aapl = page.getByRole("link", { name: /^AAPL/ });
  await expect(aapl).toContainText("$200.00");
  await expect(aapl).toContainText(/[+−]\$\d/);
  await expect(page.getByText(/fixture/).first()).toBeVisible();

  // Into the instrument: its header carries the same day change.
  await aapl.click();
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.locator("header").getByText(/[+−]\$\d+\.\d\d \([+−]\d+\.\d\d%\)/),
  ).toBeVisible();
});

test("key stats: market cap, P/E, 52-week range — and n/m for a loss", async ({ page }) => {
  await signUp(page);
  await page.goto("/i/AAPL");
  const stats = page.getByRole("region", { name: "Key stats" });
  await expect(stats.getByText("$2.92T")).toBeVisible({ timeout: 15_000 }); // 14.59B × $200
  await expect(stats.getByText("P/E ratio (TTM)")).toBeVisible();
  await expect(stats.getByText("25.3")).toBeVisible(); // $200 ÷ $7.90
  await expect(stats.getByText("52-week high")).toBeVisible();
  await expect(stats.getByText(/^\$\d{3}\.\d\d$/).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.goto("/i/TSLA"); // fixture EPS is negative
  await expect(
    page
      .getByRole("region", { name: "Key stats" })
      .locator(".ar-ticket-row__value", { hasText: /^n\/m/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
});

test("search still replaces browse while typing; unknown lists say so", async ({ page }) => {
  await signUp(page);
  await page.goto("/markets");
  await expect(page.getByRole("region", { name: "Browse" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Search US equities").fill("AAPL");
  await expect(page.getByRole("link", { name: /AAPL/ }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Browse" })).toHaveCount(0);

  await page.goto("/markets/s/not-a-sector");
  await expect(page.getByText("This list doesn't exist.")).toBeVisible({ timeout: 15_000 });
});
