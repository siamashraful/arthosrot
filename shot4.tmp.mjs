import { chromium } from "@playwright/test";
const S =
  "/private/tmp/claude-501/-Users-siamash-Documents-Claude-Code/ec699aa1-020c-483f-9efb-9d74fafa530d/scratchpad";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
const email = `motion-${Date.now()}@example.com`;
await p.goto("http://localhost:3000/signup");
await p.getByLabel("Name").fill("Motion Pass");
await p.getByLabel("Email").fill(email);
await p.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByLabel("Starting cash").waitFor({ timeout: 15000 });
await p.getByLabel("Starting cash").fill("18000");
await p.waitForTimeout(250);
await p.screenshot({ path: `${S}/v-slider.png` });
await p.getByRole("button", { name: "Open practice account" }).click();
await p.getByText("Portfolio value").waitFor({ timeout: 15000 });

await p.goto("http://localhost:3000/i/AAPL");
const t = p.locator(".ticket-docked");
await t.getByLabel("Order type").waitFor({ timeout: 15000 });
await t.getByLabel("Order type").selectOption("LIMIT");
await t.getByLabel("Quantity (whole shares)").fill("10");
await t.getByLabel("Limit price").fill("150");
await t.getByRole("button", { name: "Review order" }).click();
await t.getByRole("button", { name: "Confirm order" }).click();
await t.getByText("Open", { exact: true }).waitFor({ timeout: 15000 });
await p.waitForTimeout(300);
await p.screenshot({ path: `${S}/v-ticket-resting.png` });

await t.getByLabel("Order type").selectOption("MARKET");
await t.getByLabel("Quantity (whole shares)").fill("6");
await t.getByRole("button", { name: "Review order" }).click();
await t.getByRole("button", { name: "Confirm order" }).click();
await t.getByText("Filled", { exact: true }).waitFor({ timeout: 15000 });
await p.waitForTimeout(300);
await t.getByText("Why is this less than my cash?").click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${S}/v-ticket-filled-explainer.png` });

await p.goto("http://localhost:3000/orders");
await p.waitForTimeout(600);
await p.screenshot({ path: `${S}/v-orders-table.png` });
await p.getByRole("link", { name: /Buy 6 AAPL/ }).click();
await p.getByText("What do these statuses mean?").waitFor({ timeout: 15000 });
await p.getByText("What do these statuses mean?").click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${S}/v-order-detail.png` });

const m = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const mp = await m.newPage();
await mp.goto("http://localhost:3000/signin");
await mp.getByLabel("Email").fill(email);
await mp.getByLabel("Password", { exact: false }).fill("correct horse battery 9");
await mp.getByRole("button", { name: "Sign in" }).click();
await mp.waitForTimeout(1500);
await mp.goto("http://localhost:3000/i/AAPL");
await mp.getByRole("button", { name: /^Trade / }).click();
await mp.waitForTimeout(400);
await mp.screenshot({ path: `${S}/v-mobile-sheet-dark.png` });
await b.close();
console.log("done");
