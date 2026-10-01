import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, signUp } from "./helpers";

/**
 * Price alerts (ADR-016) end to end: deterministic broker + fixture market
 * (AAPL fixed at $200.00, market forced OPEN by playwright.config.ts).
 *
 * Mounts: AlertSheet's "Set alert" trigger in the instrument page app bar,
 * AlertsBell in the phone top bar and the desktop sidebar.
 */

async function openAlertSheet(page: Page) {
  await page.goto("/i/AAPL");
  await page.getByRole("button", { name: "Set alert" }).click();
  const sheet = page.locator("dialog.sheet[open]");
  await expect(sheet.getByRole("heading", { name: "AAPL price alert" })).toBeVisible();
  return sheet;
}

/** The bell lives in the top bar on phones and the sidebar on desktop. */
function bell(page: Page) {
  return page.locator("button.alerts-bell:visible");
}

test("set an alert from the instrument page, see it, delete it", async ({ page }) => {
  await signUp(page, { tag: "e2e-alerts" });
  const sheet = await openAlertSheet(page);

  // The current price, with its freshness, and the field prefilled with it.
  await expect(sheet.getByText("$200.00").first()).toBeVisible();
  await expect(sheet.locator(".ar-tag").first()).toBeVisible();
  const price = sheet.getByLabel("Price", { exact: true });
  await expect(price).toHaveValue("200.00");

  // An "above" alert at or under the current price is refused before submit.
  await sheet.getByRole("button", { name: "Above", exact: true }).click();
  await price.fill("199");
  await expect(sheet.getByRole("alert")).toContainText("Pick a price above it.");
  await expect(sheet.getByRole("button", { name: "Set alert" })).toBeDisabled();

  await price.fill("210");
  await sheet.getByRole("button", { name: "Set alert" }).click();
  await expect(sheet.getByRole("status")).toContainText("Alert set: AAPL above $210.00.");
  const active = sheet.getByRole("region", { name: "Active alerts for AAPL" });
  await expect(active.getByText("Above $210.00")).toBeVisible();

  // The same alert again is idempotent: no second row.
  await price.fill("210.00");
  await sheet.getByRole("button", { name: "Set alert" }).click();
  await expect(sheet.getByRole("status")).toContainText("You already have this alert");
  await expect(active.locator(".ar-row")).toHaveCount(1);

  await expectNoSeriousA11yViolations(page);

  await active.getByRole("button", { name: "Delete alert: AAPL above $210.00" }).click();
  await expect(active.getByText("No active alerts for AAPL.")).toBeVisible();
});

test("a triggered alert shows a dot on the bell and reads in the alerts sheet", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-alerts" });
  await page.goto("/");

  // AAPL sits at exactly $200.00: a BELOW 200 alert holds on the next check
  // (inclusive). The sheet refuses it as already met, so create it via the API.
  const res = await page.request.post("/api/v1/alerts", {
    data: { symbol: "AAPL", direction: "BELOW", price: "200.00" },
  });
  expect(res.status()).toBe(201);

  // The bell's poll evaluates the user's alerts; reload instead of waiting 60s.
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName(/Alerts, 1 unread/);
  await expect(bell(page).locator(".alerts-bell__dot")).toBeVisible();

  await bell(page).click();
  const sheet = page.locator("dialog.sheet[open]");
  const triggered = sheet.getByRole("region", { name: "Triggered" });
  await expect(triggered.getByRole("link", { name: "AAPL crossed below $200.00" })).toBeVisible();
  await expect(triggered.getByText("New")).toBeVisible();
  await expect(triggered.getByText(/\$200\.00 · .* ET/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Opening marked it read: the dot is gone once the sheet closes.
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(bell(page)).toHaveAccessibleName("Alerts");
  await expect(bell(page).locator(".alerts-bell__dot")).toHaveCount(0);
});

test("the alerts sheet teaches when empty", async ({ page }) => {
  await signUp(page, { tag: "e2e-alerts", openAccount: false });
  await page.goto("/");
  await bell(page).click();
  const sheet = page.locator("dialog.sheet[open]");
  await expect(sheet.getByText("No price alerts yet")).toBeVisible();
});
