import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Shared E2E helpers — every spec signs up, opens the ticket and runs axe the
 * same way. Deterministic broker + fixture data (playwright.config.ts).
 */

export const uniqueEmail = (tag = "e2e") =>
  `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export const PASSWORD = "correct horse battery 9";

/** Sign up a fresh user; with `openAccount` (default) also fund the practice account. */
export async function signUp(
  page: Page,
  opts: { tag?: string; name?: string; openAccount?: boolean; startingCash?: number } = {},
): Promise<string> {
  const email = uniqueEmail(opts.tag);
  await page.goto("/signup");
  await page.getByLabel("Name").fill(opts.name ?? "E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: false }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Wait for the post-signup navigation to land (the onboarding panel), so a
  // caller's next goto can't be overridden by it — with or without funding.
  const slider = page.getByLabel("Starting cash");
  await expect(slider).toBeVisible({ timeout: 15_000 });
  if (opts.openAccount !== false) {
    if (opts.startingCash !== undefined) await slider.fill(String(opts.startingCash));
    await page.getByRole("button", { name: "Open practice account" }).click();
    await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
  }
  return email;
}

/** The ticket is docked ≥ 1024px and a bottom sheet below — return its scope. */
export async function openTicket(page: Page) {
  const trigger = page.locator(".ticket-mobile").getByRole("button", { name: /^Trade / });
  const docked = page.locator(".ticket-docked").getByRole("heading", { name: /^Trade / });
  await expect(trigger.or(docked).first()).toBeVisible({ timeout: 15_000 });
  if (await trigger.isVisible()) {
    await trigger.click();
    return page.locator("dialog.sheet[open]");
  }
  return page.locator(".ticket-docked");
}

/** No serious/critical axe violations on the current page. */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
