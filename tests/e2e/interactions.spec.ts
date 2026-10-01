import { expect, test } from "@playwright/test";
import { openTicket, signUp } from "./helpers";

/**
 * Interaction coverage (deterministic broker + fixtures): every user action
 * that previously dead-ended now completes — watchlist add AND remove, the
 * trade ticket's pre-checks, cancelling from the order detail page, and the
 * signed-in redirect away from the auth pages. Both viewport projects run it.
 */

test("watchlist: add from the instrument page, remove from the dashboard", async ({ page }) => {
  await signUp(page, { tag: "e2e-ix" });

  await page.goto("/i/AAPL");
  const add = page.getByRole("button", { name: "Add to watchlist" });
  await add.click();
  // The button flips to a real toggle — not a dead "On watchlist" state.
  const remove = page.getByRole("button", { name: "Remove from watchlist" });
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAttribute("aria-pressed", "true");

  // Removing works from the instrument page too.
  await remove.click();
  await expect(page.getByRole("button", { name: "Add to watchlist" })).toBeVisible();
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();

  // Dashboard lists it, and its remove control empties the list.
  await page.goto("/");
  const watchlist = page.getByRole("region", { name: "Watchlist" });
  await expect(watchlist.getByRole("link", { name: /AAPL/ })).toBeVisible({ timeout: 15_000 });
  await watchlist.getByRole("button", { name: "Remove AAPL from watchlist" }).click();
  await expect(watchlist.getByText(/to track them here/)).toBeVisible();
});

test("ticket pre-checks: selling unheld shares and over-spending are caught before review", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-ix" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);

  // Sell with no holdings: an explanation, and review stays closed.
  await ticket.getByRole("button", { name: "Sell", exact: true }).click();
  await ticket.getByLabel("Quantity (whole shares)").fill("1");
  await expect(ticket.getByText("You don't hold any AAPL to sell.")).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeDisabled();

  // Buy beyond buying power ($10,000 at ~$200/share): caught the same way.
  await ticket.getByRole("button", { name: "Buy", exact: true }).click();
  await ticket.getByLabel("Quantity (whole shares)").fill("1000");
  await expect(ticket.getByText(/more than your buying power/)).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeDisabled();

  // A sensible quantity clears the check.
  await ticket.getByLabel("Quantity (whole shares)").fill("2");
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeEnabled();
});

test("a resting limit order can be cancelled from its detail page", async ({ page }) => {
  await signUp(page, { tag: "e2e-ix" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await ticket
    .getByRole("group", { name: "Order type" })
    .getByRole("button", { name: "Limit (day)" })
    .click();
  await ticket.getByLabel("Quantity (whole shares)").fill("3");
  await ticket.getByLabel("Limit price").fill("150");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Open", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto("/orders");
  await page.getByRole("link", { name: "Buy 3 AAPL" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Buy 3 AAPL" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.locator(".ar-tag", { hasText: "Cancelled" }).first()).toBeVisible({
    timeout: 15_000,
  });
  // Terminal: the action is gone, not left dangling.
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
});

test("signed-in visitors to the auth pages land on the dashboard", async ({ page }) => {
  await signUp(page, { tag: "e2e-ix" });
  await page.goto("/signin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });
});

test("price chart: fixed window, scrub reads out price, change and date/time", async ({ page }) => {
  await signUp(page, { tag: "e2e-ix" });
  await page.goto("/i/AAPL");
  const chart = page.getByRole("region", { name: "AAPL price chart" });
  const canvas = chart.locator(".chart-scrub__canvas");
  await expect(canvas.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await expect(chart.getByText("past month")).toBeVisible();

  const box = (await canvas.boundingBox())!;
  const label = chart.locator(".chart-scrub__label");

  // Wheel over the chart no longer zooms (the picture is unchanged). Sent to
  // the chart itself: a real wheel would also scroll the page under it.
  const before = await canvas.screenshot();
  const cx = box.width / 2;
  const cy = box.height / 2;
  for (let i = 0; i < 5; i++) {
    await canvas
      .locator("canvas")
      .first()
      .dispatchEvent("wheel", {
        deltaY: -300,
        clientX: box.x + cx,
        clientY: box.y + cy,
        bubbles: true,
        cancelable: true,
      });
  }
  await expect(label).toBeHidden();
  expect((await canvas.screenshot()).equals(before)).toBe(true);

  // Daily range: scrubbing shows the price and the bar's date.
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await expect(label).toBeVisible();
  await expect(label).toHaveText(/^\w{3}, \w{3} \d{1,2}, \d{4}$/);
  await expect(chart.locator(".chart-readout__price")).toHaveText(/^\$\d/);

  // Intraday range: the label carries the market time.
  await page.mouse.move(box.x - 5, box.y - 40);
  await chart.getByRole("tab", { name: "1D" }).click();
  await expect(chart.getByText("last session")).toBeVisible();
  // re-measure: the tab click can scroll the page
  const box1d = (await canvas.boundingBox())!;
  await page.mouse.move(box1d.x + box1d.width * 0.5, box1d.y + box1d.height / 2);
  await expect(label).toHaveText(/\d{1,2}:\d{2} (AM|PM) ET$/);
});
