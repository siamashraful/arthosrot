import { describe, expect, it } from "vitest";
import { displayCompanyName } from "./names";

describe("displayCompanyName", () => {
  it.each([
    ["WATERS CORP /DE/", "Waters Corp."],
    ["ELI LILLY & Co", "Eli Lilly & Co."],
    ["SCHWAB CHARLES CORP", "Schwab Charles Corp."],
    ["NVIDIA CORP", "Nvidia Corp."],
    ["INTERNATIONAL BUSINESS MACHINES CORP", "International Business Machines Corp."],
    ["AT&T INC.", "AT&T Inc."],
    ["Comcast Corporation Class A Common Stock", "Comcast Corporation"],
    ["Apple Inc.", "Apple Inc."],
    ["BERKSHIRE HATHAWAY INC", "Berkshire Hathaway Inc."],
    ["Protagenic Therapeutics, Inc.\\new", "Protagenic Therapeutics, Inc."],
  ])("%s → %s", (raw, clean) => {
    expect(displayCompanyName(raw)).toBe(clean);
  });
});
