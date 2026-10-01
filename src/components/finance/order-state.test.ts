import { describe, expect, it } from "vitest";
import type { OrderState } from "@/lib/api";
import {
  humanizeCode,
  isCancellable,
  isOrderOpen,
  isOrderTerminal,
  orderEventChip,
  orderStateChip,
  orderStateTag,
} from "./order-state";

const ALL: OrderState[] = [
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_PENDING",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "SUBMIT_FAILED",
];

describe("order state", () => {
  it("every state is exactly one of open or terminal", () => {
    for (const s of ALL) expect(isOrderOpen(s) !== isOrderTerminal(s)).toBe(true);
  });

  it("only working orders the venue still accepts a cancel for are cancellable", () => {
    expect(ALL.filter(isCancellable)).toEqual(["ACKNOWLEDGED", "ACCEPTED", "PARTIALLY_FILLED"]);
  });

  it("a rejection never reads like a cancel (different icon)", () => {
    expect(orderStateTag("REJECTED").icon).toBe("alert");
    expect(orderStateTag("CANCELLED").icon).toBe("x");
    expect(orderStateTag("FILLED")).toEqual({ cls: "ar-tag--filled", icon: "check" });
    expect(orderStateChip("PARTIALLY_FILLED")).toEqual({
      cls: "ar-chipicon--warning",
      icon: "clock",
    });
  });

  it("timeline events chip by what they did", () => {
    expect(orderEventChip("ORDER_PARTIALLY_FILLED").icon).toBe("check");
    expect(orderEventChip("ORDER_REJECTED").icon).toBe("alert");
    expect(orderEventChip("ORDER_CANCEL_PENDING").icon).toBe("x");
    expect(orderEventChip("ORDER_ACCEPTED").icon).toBe("clock");
  });

  it("humanizes codes", () => {
    expect(humanizeCode("PARTIALLY_FILLED")).toBe("Partially filled");
  });
});
