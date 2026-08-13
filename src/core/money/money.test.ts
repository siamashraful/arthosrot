import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Basis, Money, notional, Px, Qty, reserveWithBuffer } from "./money";

const centsArb = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
const moneyArb = centsArb.map((c) => {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return Money.fromString(`${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`);
});
const pxArb = fc
  .integer({ min: 1, max: 5_000_000_000 })
  .map((tenThousandths) =>
    Px.fromString(
      `${Math.floor(tenThousandths / 10_000)}.${String(tenThousandths % 10_000).padStart(4, "0")}`,
    ),
  );
const qtyArb = fc.integer({ min: 1, max: 1_000_000 }).map((n) => Qty.of(n));

describe("Money", () => {
  it("rejects excess precision and garbage", () => {
    expect(() => Money.fromString("1.234")).toThrow();
    expect(() => Money.fromString("1,00")).toThrow();
    expect(() => Money.fromString("1e5")).toThrow();
    expect(() => Money.fromString("NaN")).toThrow();
  });

  it("round-trips through its canonical string", () => {
    fc.assert(
      fc.property(moneyArb, (m) => {
        expect(Money.fromString(m.toString()).equals(m)).toBe(true);
      }),
    );
  });

  it("addition is associative and has zero identity (exact arithmetic)", () => {
    fc.assert(
      fc.property(moneyArb, moneyArb, moneyArb, (a, b, c) => {
        expect(
          a
            .add(b)
            .add(c)
            .equals(a.add(b.add(c))),
        ).toBe(true);
        expect(a.add(Money.zero()).equals(a)).toBe(true);
        expect(a.add(a.negate()).isZero()).toBe(true);
      }),
    );
  });

  it("sum is order-independent", () => {
    fc.assert(
      fc.property(fc.array(moneyArb, { maxLength: 30 }), (values) => {
        const shuffled = [...values].reverse();
        expect(Money.sum(values).equals(Money.sum(shuffled))).toBe(true);
      }),
    );
  });
});

describe("notional", () => {
  it("BUY 10 AAPL @ 200.0000 = 2000.00 (golden)", () => {
    expect(notional(Px.fromString("200"), Qty.of(10)).toString()).toBe("2000.00");
  });

  it("rounds half-even exactly once", () => {
    // 3 shares @ 0.0025 = 0.0075 -> 0.01? HALF_EVEN on 0.0075 to 2dp -> 0.01 (7 is odd digit)
    expect(notional(Px.fromString("0.0025"), Qty.of(3)).toString()).toBe("0.01");
    // 2 shares @ 0.0025 = 0.005 -> HALF_EVEN to 2dp -> 0.00
    expect(notional(Px.fromString("0.0025"), Qty.of(2)).toString()).toBe("0.00");
  });

  it("is within half a cent of the exact product", () => {
    fc.assert(
      fc.property(pxArb, qtyArb, (px, qty) => {
        const exact = px.toDecimal().mul(qty.toString());
        const rounded = notional(px, qty).toDecimal();
        expect(rounded.minus(exact).abs().lte("0.005")).toBe(true);
      }),
    );
  });
});

describe("reserveWithBuffer", () => {
  it("reserves at least the notional and at most notional*(1+buffer)+cent", () => {
    fc.assert(
      fc.property(pxArb, qtyArb, (px, qty) => {
        const plain = notional(px, qty);
        const reserved = reserveWithBuffer(px, qty, 0.025);
        expect(reserved.gte(plain)).toBe(true);
        const cap = px.toDecimal().mul(qty.toString()).mul("1.025").plus("0.01");
        expect(reserved.toDecimal().lte(cap)).toBe(true);
      }),
    );
  });
});

describe("Basis", () => {
  it("full allocation empties the basis exactly (invariant 12)", () => {
    fc.assert(
      fc.property(pxArb, qtyArb, (px, qty) => {
        const basis = Basis.zero().addMoney(notional(px, qty));
        const { allocated, remaining } = basis.allocate(qty, qty);
        expect(remaining.isZero()).toBe(true);
        expect(allocated.toString()).toBe(notional(px, qty).toString());
      }),
    );
  });

  it("sequential partial allocations always sum to the original basis", () => {
    fc.assert(
      fc.property(
        pxArb,
        fc.integer({ min: 2, max: 500 }),
        fc.integer({ min: 1, max: 499 }),
        (px, total, soldRaw) => {
          const sold = Math.min(soldRaw, total - 1);
          const totalQty = Qty.of(total);
          const original = Basis.zero().addMoney(notional(px, totalQty));
          const first = original.allocate(Qty.of(sold), totalQty);
          const second = first.remaining.allocate(Qty.of(total - sold), Qty.of(total - sold));
          const together = first.allocated.add(second.allocated);
          // Allocations reconcile to the (2dp-rounded) original basis.
          const originalRounded = original.allocate(totalQty, totalQty).allocated;
          expect(together.equals(originalRounded)).toBe(true);
        },
      ),
    );
  });

  it("computes average cost at 4dp", () => {
    const basis = Basis.zero().addMoney(Money.fromString("2000.00"));
    expect(basis.avgPx(Qty.of(10)).toString()).toBe("200.0000");
    const uneven = Basis.zero().addMoney(Money.fromString("100.00"));
    expect(uneven.avgPx(Qty.of(3)).toString()).toBe("33.3333");
  });

  it("never goes negative", () => {
    expect(() => Basis.zero().addMoney(Money.fromString("-1.00"))).toThrow();
  });
});

describe("Qty", () => {
  it("rejects fractions, negatives, and garbage", () => {
    expect(() => Qty.of(1.5)).toThrow();
    expect(() => Qty.of(-1)).toThrow();
    expect(() => Qty.of("1.5")).toThrow();
    expect(() => Qty.of("-3")).toThrow();
  });

  it("subtraction underflow throws (invariant 3 guard)", () => {
    expect(() => Qty.of(5).subtract(Qty.of(6))).toThrow();
  });
});
