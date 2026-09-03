import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Live-mode preview E2E (ADR-011): the Settings switch flips the app into the
 * live PREVIEW — three-signal mode change, live's OWN empty states (paper
 * data must never render as live), non-functional funding sheets — and back.
 */

const email = () => `e2e-live-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("switch to live preview, verify isolation from paper data, switch back", async ({ page }) => {
  // Sign up + open a paper account so there IS paper data to leak.
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Live Preview");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
  await page.getByRole("button", { name: "Create account" }).click();
  const slider = page.getByLabel("Starting cash");
  await expect(slider).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });

  // Practice ribbon is up (the load-bearing simulation notice).
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();

  // Settings: the trading-mode section, then flip to Live via the confirm sheet.
  await page.goto("/settings");
  const modeSection = page.getByRole("region", { name: "Trading mode" });
  await expect(modeSection.getByRole("button", { name: "Practice" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoSeriousA11yViolations(page);
  await modeSection.getByRole("button", { name: "Live", exact: true }).click();
  const confirm = page.locator("dialog.sheet[open]");
  // The confirmation names the mode in words (BRAND.md §5) and stays honest.
  await expect(confirm.getByRole("heading", { name: "Switch to live trading" })).toBeVisible();
  await expect(confirm.getByText(/isn't enabled yet/)).toBeVisible();
  await confirm.getByRole("button", { name: "Switch to live" }).click();

  // Signal 3 flips: the ribbon now carries the live-preview notice.
  await expect(page.getByRole("note", { name: "Live trading notice" })).toBeVisible();
  await expect(page.getByRole("note", { name: "Simulation notice" })).toHaveCount(0);

  // Dashboard: live's OWN empty state — $0.00, never the paper $10,000.
  await page.goto("/");
  await expect(page.getByText("Live portfolio value")).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(page.getByText("$10,000.00")).toHaveCount(0);
  await expect(page.getByText("Portfolio value", { exact: true })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // The deposit sheet opens, is honest, and cannot submit.
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  // Both funding dialogs exist in the DOM — assert inside the OPEN one.
  const deposit = page.locator("dialog.sheet[open]");
  await expect(deposit.getByText(/no money moves/)).toBeVisible();
  await expect(deposit.getByRole("button", { name: "Deposit funds" })).toBeDisabled();
  await expectNoSeriousA11yViolations(page);
  await deposit.getByRole("button", { name: "Close" }).click();

  // Portfolio and orders show live empty states, not paper content.
  await page.goto("/portfolio");
  await expect(page.getByText(/No live positions/)).toBeVisible();
  await page.goto("/orders");
  await expect(page.getByText(/No live orders/)).toBeVisible();

  // The preview survives a reload (pre-hydration script applies the mode).
  await page.reload();
  await expect(page.getByRole("note", { name: "Live trading notice" })).toBeVisible();

  // Switch back to Practice — instant, no dialog — and paper data returns.
  await page.goto("/settings");
  await page
    .getByRole("region", { name: "Trading mode" })
    .getByRole("button", { name: "Practice" })
    .click();
  await expect(page.getByRole("note", { name: "Simulation notice" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("$10,000.00").first()).toBeVisible();
});
