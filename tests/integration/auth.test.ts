import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { getSession } from "@/server/session";
import { truncateAll } from "./helpers";

const signup = { name: "Test User", email: "user@example.com", password: "correct horse 9" };

describe("authentication", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("signs up, signs in, and resolves a session", async () => {
    const auth = getAuth();
    await auth.api.signUpEmail({ body: signup });

    const res = await auth.api.signInEmail({
      body: { email: signup.email, password: signup.password },
      returnHeaders: true,
    });
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const session = await getSession(new Headers({ cookie: cookie ?? "" }));
    expect(session?.email).toBe(signup.email);
  });

  it("rejects weak passwords server-side", async () => {
    await expect(
      getAuth().api.signUpEmail({
        body: { ...signup, password: "aaaaaaaaaaaa" }, // long but single-class
      }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("rejects duplicate email signup", async () => {
    const auth = getAuth();
    await auth.api.signUpEmail({ body: signup });
    await expect(auth.api.signUpEmail({ body: signup })).rejects.toThrow();
  });

  it("rejects wrong password on signin", async () => {
    const auth = getAuth();
    await auth.api.signUpEmail({ body: signup });
    await expect(
      auth.api.signInEmail({ body: { email: signup.email, password: "wrong password 1" } }),
    ).rejects.toThrow();
  });

  it("returns null session for anonymous requests", async () => {
    expect(await getSession(new Headers())).toBeNull();
  });
});
