import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, openTicket, signUp } from "./helpers";

/**
 * Trading E2E (deterministic broker + fixtures; AAPL last 200.00, ask
 * 200.10): ticket validation, cross-screen freshness after place/cancel,
 * idempotent confirm after a lost response, failure and retry states, the
 * unknown / delisted / missing-order pages, live-preview refusal, and axe
 * scans of the instrument and order pages. Both viewport projects run it.
 */

async function chooseLimit(ticket: Locator) {
  await ticket
    .getByRole("group", { name: "Order type" })
    .getByRole("button", { name: "Limit (day)" })
    .click();
}

/** Place a resting (non-marketable) limit buy and wait for its Open chip. */
async function placeRestingLimit(ticket: Locator, qty: string, price: string) {
  await chooseLimit(ticket);
  await ticket.getByLabel("Quantity (whole shares)").fill(qty);
  await ticket.getByLabel("Limit price").fill(price);
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Open", { exact: true }),
  ).toBeVisible();
}

const envelope = (status: number, code: string, message: string, subcode?: string) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({
    error: { code, ...(subcode ? { subcode } : {}), message, requestId: "e2e" },
  }),
});

test("ticket validation: zero limit price, zero quantity, mid-typing stays quiet", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await chooseLimit(ticket);

  const qty = ticket.getByLabel("Quantity (whole shares)");
  const limit = ticket.getByLabel("Limit price");
  const review = ticket.getByRole("button", { name: "Review order" });

  await qty.fill("0");
  await expect(ticket.getByText("Enter at least 1 share.")).toBeVisible();
  await expect(qty).toHaveAttribute("aria-invalid", "true");
  await qty.fill("5");

  await limit.fill("0");
  await expect(ticket.getByText("Limit price must be more than $0.")).toBeVisible();
  await expect(review).toBeDisabled();

  // "150." is someone still typing — no error, but nothing to review yet.
  await limit.fill("150.");
  await expect(ticket.locator(".field-error")).toHaveCount(0);
  await expect(review).toBeDisabled();

  // Letters and extra decimals never reach the field.
  await limit.fill("1a50.123456");
  await expect(limit).toHaveValue("150.1234");
  await expect(ticket.getByText("$750.62")).toBeVisible(); // 5 × 150.1234, exact to the cent
  await expect(review).toBeEnabled();
});

test("placing and cancelling a limit buy refreshes buying power everywhere it shows", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/AAPL");
  let ticket = await openTicket(page);
  await expect(ticket.getByText("Buying power $10,000.00")).toBeVisible();

  // 10 × $150 reserves $1,500 the moment the order is accepted.
  await placeRestingLimit(ticket, "10", "150");
  await chooseLimit(ticket); // back on the edit view, buying power is visible again
  await expect(ticket.getByText("Buying power $8,500.00")).toBeVisible();

  // The chip links to the order; cancelling there releases the reservation.
  await ticket.getByRole("link", { name: "View order details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Buy 10 AAPL" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.locator(".ar-tag", { hasText: "Cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Timeline" }).getByText("Order cancelled"),
  ).toBeVisible();

  // Client-side back to the instrument: the cached portfolio was invalidated
  // by the cancel, so the ticket shows the released buying power.
  await page.goBack();
  ticket = await openTicket(page);
  await expect(ticket.getByText("Buying power $10,000.00")).toBeVisible();
});

test("a market buy fills; order detail shows the fill and the event timeline", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await ticket.getByLabel("Quantity (whole shares)").fill("2");
  await expect(ticket.getByText("$400.20")).toBeVisible(); // 2 × ask 200.10
  await ticket.getByRole("button", { name: "Review order" }).click();
  await expect(ticket.getByText("Buy 2 AAPL · Market · est. $400.20")).toBeVisible();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  const chip = ticket.locator('[aria-live="polite"]');
  await expect(chip.getByText("Filled", { exact: true })).toBeVisible();

  // Selling more than is held is caught before review.
  await ticket.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(ticket.getByText("Sellable 2 shares")).toBeVisible();
  await ticket.getByLabel("Quantity (whole shares)").fill("3");
  await expect(ticket.getByText("You can sell up to 2 shares.")).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeDisabled();

  await ticket.getByRole("link", { name: "View order details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Buy 2 AAPL" })).toBeVisible();
  const fills = page.getByRole("region", { name: "Fills" });
  await expect(fills.getByText(/^2 shares at \$/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Timeline" }).getByText("Order filled"),
  ).toBeVisible();
  // No cancel on a final order.
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
});

test("a lost response: confirming again replays the same order, never a second one", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);

  // The first POST reaches the server (the order IS placed) but the
  // response is lost: the browser sees a 500.
  const keys: string[] = [];
  let lose = true;
  await page.route("**/api/v1/orders", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    keys.push((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
    const response = await route.fetch();
    if (lose) {
      lose = false;
      return route.fulfill(envelope(500, "INTERNAL", "Something went wrong"));
    }
    return route.fulfill({ response });
  });

  await placeRestingLimitReview(ticket, "4", "120");
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  // Still on review, with honest copy and the same Confirm.
  await expect(ticket.getByText(/couldn't confirm the order went through/)).toBeVisible();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(
    ticket.locator('[aria-live="polite"]').getByText("Open", { exact: true }),
  ).toBeVisible();

  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "Buy 4 AAPL" })).toHaveCount(1);
});

async function placeRestingLimitReview(ticket: Locator, qty: string, price: string) {
  await chooseLimit(ticket);
  await ticket.getByLabel("Quantity (whole shares)").fill(qty);
  await ticket.getByLabel("Limit price").fill(price);
  await ticket.getByRole("button", { name: "Review order" }).click();
}

test("a refused order explains itself in plain words and returns to editing", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/AAPL");
  const ticket = await openTicket(page);
  await page.route("**/api/v1/orders", (route) =>
    route.request().method() === "POST"
      ? route.fulfill(
          envelope(
            422,
            "DOMAIN_RULE",
            "Order needs 2051.03 but buying power is 2000.00",
            "INSUFFICIENT_BUYING_POWER",
          ),
        )
      : route.fallback(),
  );
  await ticket.getByLabel("Quantity (whole shares)").fill("10");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await ticket.getByRole("button", { name: "Confirm order" }).click();
  await expect(ticket.getByText(/Not enough buying power for this order/)).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeVisible();
  // Editing clears the error.
  await ticket.getByLabel("Quantity (whole shares)").fill("1");
  await expect(ticket.getByText(/Not enough buying power/)).toHaveCount(0);
});

test("unknown and malformed symbols get a not-found page", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/i/ZZZZQ");
  await expect(page.getByText("Unknown symbol “ZZZZQ”")).toBeVisible();
  await expect(
    page.locator(".ar-empty").getByRole("link", { name: "Search markets" }),
  ).toBeVisible();
  // a symbol the API rejects as malformed (400) reads the same way
  await page.goto("/i/not%20a%20symbol!");
  await expect(page.getByText(/Unknown symbol/)).toBeVisible();
});

test("an instrument that fails to load offers a retry that recovers", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  let fail = true;
  await page.route("**/api/v1/instruments/AAPL", (route) =>
    fail ? route.fulfill(envelope(500, "INTERNAL", "Something went wrong")) : route.fallback(),
  );
  await page.goto("/i/AAPL");
  // a server failure is not "unknown symbol"
  await expect(page.getByText("AAPL couldn't be loaded right now.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Unknown symbol/)).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AAPL" })).toBeVisible();
});

test("the ticket's buying power failing to load offers a retry", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  let fail = true;
  await page.route("**/api/v1/portfolio", (route) =>
    fail ? route.fulfill(envelope(500, "INTERNAL", "Something went wrong")) : route.fallback(),
  );
  await page.goto("/i/AAPL");
  await expect(page.getByText("The trade ticket couldn't load your buying power.")).toBeVisible({
    timeout: 20_000,
  });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await openTicket(page);
});

test("a delisted symbol (no quote): sells only, limit only, with reasons", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.route("**/api/v1/instruments/AAPL", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { instrument: Record<string, unknown> };
    await route.fulfill({
      response,
      json: {
        ...body,
        instrument: { ...body.instrument, status: "DELISTED" },
        quote: null,
        freshness: null,
      },
    });
  });
  await page.goto("/i/AAPL");
  await expect(page.getByText(/No live quote: this symbol may be delisted/)).toBeVisible();
  const ticket = await openTicket(page);
  const type = ticket.getByRole("group", { name: "Order type" });
  await expect(type.getByRole("button", { name: "Market" })).toBeDisabled();
  await expect(type.getByRole("button", { name: "Limit (day)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    ticket.getByText("Market orders need a live quote. Use a limit order."),
  ).toBeVisible();
  // Starts on Sell; Buy says why it can't proceed.
  await expect(ticket.getByRole("button", { name: "Sell", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await ticket.getByRole("button", { name: "Buy", exact: true }).click();
  await ticket.getByLabel("Quantity (whole shares)").fill("1");
  await ticket.getByLabel("Limit price").fill("10");
  await expect(
    ticket.getByText("AAPL is no longer tradable. Shares you hold can still be sold."),
  ).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Review order" })).toBeDisabled();
});

test("order pages: a missing order and a failed load are told apart", async ({ page }) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.goto("/orders/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Order not found")).toBeVisible();
  await page.goto("/orders/not-a-uuid");
  await expect(page.getByText("Order not found")).toBeVisible();

  let fail = true;
  await page.route("**/api/v1/orders?status=open", (route) =>
    fail ? route.fulfill(envelope(500, "INTERNAL", "Something went wrong")) : route.fallback(),
  );
  await page.goto("/orders");
  await expect(page.getByText("Orders couldn't be loaded.")).toBeVisible({ timeout: 20_000 });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No open orders.")).toBeVisible();
});

test("live preview: the instrument page refuses to draft an order and hides paper data", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-trade" });
  await page.addInitScript(() => window.localStorage.setItem("trading-mode", "live"));
  await page.goto("/i/AAPL");
  await expect(page.getByRole("heading", { level: 1, name: "AAPL" })).toBeVisible();
  await expect(page.getByText(/Live orders aren.t available yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Trade / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /watchlist/ })).toHaveCount(0);
  await expect(page.getByText("Your position")).toHaveCount(0);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

async function scanInstrument(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/i/AAPL");
  await expect(page.locator(".chart-scrub__canvas canvas").first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Stats" }).getByText("Market cap", { exact: true }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  const ticket = await openTicket(page);
  await ticket.getByLabel("Quantity (whole shares)").fill("1");
  await ticket.getByRole("button", { name: "Review order" }).click();
  await expectNoSeriousA11yViolations(page);
}

test("instrument page and review step have no serious a11y violations, light and dark", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-trade" });
  await scanInstrument(page, "light");
  await scanInstrument(page, "dark");
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the ticket is a bottom sheet with exactly one ticket mounted", async ({ page }) => {
    await signUp(page, { tag: "e2e-trade" });
    await page.goto("/i/AAPL");
    await expect(page.locator(".ticket-docked")).toHaveCount(0);
    const ticket = await openTicket(page);
    await expect(page.getByRole("heading", { name: "Trade AAPL" })).toHaveCount(1);
    await ticket.getByLabel("Quantity (whole shares)").fill("1");
    await ticket.getByRole("button", { name: "Review order" }).click();
    await ticket.getByRole("button", { name: "Confirm order" }).scrollIntoViewIfNeeded();
    await ticket.getByRole("button", { name: "Confirm order" }).click();
    await expect(
      ticket.locator('[aria-live="polite"]').getByText("Filled", { exact: true }),
    ).toBeVisible();
    await ticket.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Your position")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // the orders list and order detail fit the phone too
    await page.goto("/orders");
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("link", { name: "Buy 1 AAPL" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "Buy 1 AAPL" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Buy 1 AAPL" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
