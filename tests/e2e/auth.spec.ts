import { expect, test } from "@playwright/test";
import { PASSWORD, expectNoSeriousA11yViolations, signUp, uniqueEmail } from "./helpers";

/**
 * Auth + onboarding (FR-1, FR-2): sign-up validation, sign-in failures, the
 * return path through sign-in, signed-in visitors bounced off the auth pages,
 * sign-out, a session lost under an open page, and the onboarding panel's
 * slider, pending and failure states. Both viewport projects run it.
 */

test("sign-up: weak password and duplicate email are refused with a reason", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByText(/simulated money only/)).toBeVisible(); // the disclosure
  await expectNoSeriousA11yViolations(page);

  const email = uniqueEmail("e2e-auth");
  await page.getByLabel("Name").fill("E2E Auth");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: false }).fill("aaaaaaaaaa");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Password too weak/ })).toBeVisible();
  // The button is usable again — never stuck on its busy label.
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();

  await page.getByLabel("Password", { exact: false }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open practice account" })).toBeVisible({
    timeout: 15_000,
  });

  // Same email again, signed out: refused.
  await page.context().clearCookies();
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Auth");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: false }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /already exists/ })).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("sign-in: wrong password is refused; the return path survives sign-in", async ({ page }) => {
  const email = await signUp(page, { tag: "e2e-auth" });
  await page.context().clearCookies();

  // A signed-out deep link goes to sign-in carrying where it was headed.
  await page.goto("/activity");
  await expect(page).toHaveURL(/\/signin\?next=%2Factivity$/);
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password 42");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid email or password" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
});

test("sign-in ignores an off-site return path", async ({ page }) => {
  const email = await signUp(page, { tag: "e2e-auth", openAccount: false });
  await expect(page.getByLabel("Starting cash")).toBeVisible({ timeout: 15_000 }); // signed in, landed
  await page.context().clearCookies();
  await page.goto("/signin?next=//evil.example/steal");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("signed in: auth pages bounce to the dashboard; sign-out ends the session", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-auth" });
  await page.goto("/signin");
  await expect(page).toHaveURL("http://localhost:3000/");
  await page.goto("/signup");
  await expect(page).toHaveURL("http://localhost:3000/");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  // The app is closed again.
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/signin\?next=%2Fportfolio$/);
});

test("a session that ends under an open page goes to sign-in, keeping the page", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-auth" });
  await page.context().clearCookies();
  // Client-side navigation: the shell stays, and the page's first query
  // (nothing cached for Activity yet) gets a 401.
  await page.getByRole("link", { name: "Activity" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/signin\?next=%2Factivity$/, { timeout: 15_000 });
});

test("onboarding: slider bounds, chosen starting cash becomes the opening deposit", async ({
  page,
}) => {
  await signUp(page, { tag: "e2e-onb", openAccount: false });
  const slider = page.getByLabel("Starting cash");
  await expect(slider).toBeVisible({ timeout: 15_000 });
  await expect(slider).toHaveAttribute("min", "1000");
  await expect(slider).toHaveAttribute("max", "25000");
  await expect(slider).toHaveAttribute("aria-valuetext", "$10,000");
  await expectNoSeriousA11yViolations(page);

  await slider.fill("2500");
  await expect(slider).toHaveAttribute("aria-valuetext", "$2,500");
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByText("Portfolio value")).toBeVisible({ timeout: 15_000 });

  await page.goto("/activity");
  await expect(page.getByText("+$2,500.00")).toBeVisible();
});

test("onboarding: pending setup and a failed setup are stated plainly", async ({ page }) => {
  await signUp(page, { tag: "e2e-onb", openAccount: false });
  await expect(page.getByLabel("Starting cash")).toBeVisible({ timeout: 15_000 });

  // The venue reports a failed setup: loss banner, and opening again is offered.
  await page.route("**/api/v1/me", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({
      json: {
        ...body,
        account: { cash: "0.00", status: "PROVISIONING_FAILED", startingCash: "10000.00" },
      },
    });
  });
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: /Account setup failed at the trading venue/ }),
  ).toBeVisible({ timeout: 15_000 });

  // Retrying fails too (a 500): the error is shown and the button comes back.
  await page.route("**/api/v1/account/provision", (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "INTERNAL", message: "Something went wrong", requestId: "t" } },
    }),
  );
  await page.getByRole("button", { name: "Open practice account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open practice account" })).toBeEnabled();
  await expectNoSeriousA11yViolations(page);

  // Funding in flight: the honest waiting state, no slider.
  await page.unroute("**/api/v1/me");
  await page.route("**/api/v1/me", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({
      json: {
        ...body,
        account: { cash: "0.00", status: "PROVISIONING", startingCash: "10000.00" },
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Setting up your account" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Starting cash")).toHaveCount(0);
});
