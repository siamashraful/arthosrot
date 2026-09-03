import { describe, expect, it } from "vitest";
import { AppError } from "../shared";
import { FundingNotEnabledError } from "./funding";

describe("FundingNotEnabledError", () => {
  it("is a DOMAIN_RULE AppError while live funding does not exist", () => {
    const err = new FundingNotEnabledError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("DOMAIN_RULE");
    expect(err.httpStatus).toBe(422);
    expect(err.name).toBe("FundingNotEnabledError");
    expect(err.message).toMatch(/not enabled/);
  });
});
