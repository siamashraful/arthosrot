import { Decimal } from "decimal.js";
import { invariant } from "../shared/invariant";

/**
 * Financial value objects (ADR-003, docs/architecture/FINANCIAL_INVARIANTS.md).
 *
 * - Money: USD amounts, exactly 2 decimal places.
 * - Px:    prices, exactly 4 decimal places.
 * - Qty:   whole-share quantities (bigint).
 * - Basis: position cost basis, 4 decimal places.
 *
 * Rounding is ROUND_HALF_EVEN and happens exactly once per derivation — in the
 * named derivation helpers (notional, applyRatio, allocate…), never implicitly.
 * Constructors accept already-exact strings and REJECT excess precision, so a
 * value can't silently lose cents on the way in. Raw JS numbers are never used
 * for arithmetic; JSON serialization is strings.
 */

const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;
const PX_RE = /^\d+(\.\d{1,4})?$/;
const BASIS_RE = /^\d+(\.\d{1,4})?$/;

export class Money {
  private constructor(private readonly d: InstanceType<typeof Dec>) {}

  static fromString(value: string): Money {
    invariant(MONEY_RE.test(value), `invalid Money string: ${JSON.stringify(value)}`);
    return new Money(new Dec(value));
  }

  static zero(): Money {
    return new Money(new Dec(0));
  }

  /** Internal factory for derivation helpers — input must already be 2dp-exact. */
  static fromDecimalExact(d: InstanceType<typeof Dec>): Money {
    invariant(d.decimalPlaces() <= 2, `Money requires <=2dp, got ${d.toString()}`);
    return new Money(d);
  }

  add(other: Money): Money {
    return new Money(this.d.plus(other.d));
  }

  subtract(other: Money): Money {
    return new Money(this.d.minus(other.d));
  }

  negate(): Money {
    return new Money(this.d.neg());
  }

  abs(): Money {
    return new Money(this.d.abs());
  }

  static sum(values: readonly Money[]): Money {
    return values.reduce((acc, v) => acc.add(v), Money.zero());
  }

  compare(other: Money): -1 | 0 | 1 {
    return this.d.cmp(other.d) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.d.eq(other.d);
  }

  gte(other: Money): boolean {
    return this.d.gte(other.d);
  }

  lt(other: Money): boolean {
    return this.d.lt(other.d);
  }

  isZero(): boolean {
    return this.d.isZero();
  }

  isNegative(): boolean {
    return this.d.isNegative() && !this.d.isZero();
  }

  /** Canonical fixed-2dp string, e.g. "-1234.50". Also the JSON form. */
  toString(): string {
    return this.d.toFixed(2);
  }

  toJSON(): string {
    return this.toString();
  }

  /** Escape hatch for derivation helpers in this module only. */
  toDecimal(): InstanceType<typeof Dec> {
    return this.d;
  }
}

/**
 * Percent change from -> to, as a fixed-2dp string ("4.10", "-12.50"), or
 * null when `from` is zero or negative (a percentage of nothing is not a
 * number worth printing). Derivation helper: rounds exactly once, HALF_EVEN.
 */
export function percentChange(from: Money, to: Money): string | null {
  const base = from.toDecimal();
  if (base.lte(0)) return null;
  return to.toDecimal().minus(base).div(base).times(100).toFixed(2);
}

export class Px {
  private constructor(private readonly d: InstanceType<typeof Dec>) {}

  static fromString(value: string): Px {
    invariant(PX_RE.test(value), `invalid Px string: ${JSON.stringify(value)}`);
    const d = new Dec(value);
    invariant(d.gt(0), `Px must be positive, got ${value}`);
    return new Px(d);
  }

  compare(other: Px): -1 | 0 | 1 {
    return this.d.cmp(other.d) as -1 | 0 | 1;
  }

  lte(other: Px): boolean {
    return this.d.lte(other.d);
  }

  gte(other: Px): boolean {
    return this.d.gte(other.d);
  }

  min(other: Px): Px {
    return this.lte(other) ? this : other;
  }

  max(other: Px): Px {
    return this.gte(other) ? this : other;
  }

  /** Canonical fixed-4dp string, e.g. "200.0000". Also the JSON form. */
  toString(): string {
    return this.d.toFixed(4);
  }

  toJSON(): string {
    return this.toString();
  }

  toDecimal(): InstanceType<typeof Dec> {
    return this.d;
  }
}

export class Qty {
  private constructor(private readonly n: bigint) {}

  static of(value: bigint | number | string): Qty {
    let n: bigint;
    if (typeof value === "bigint") {
      n = value;
    } else if (typeof value === "number") {
      invariant(Number.isSafeInteger(value), `Qty must be a whole number, got ${value}`);
      n = BigInt(value);
    } else {
      invariant(/^\d+$/.test(value), `invalid Qty string: ${JSON.stringify(value)}`);
      n = BigInt(value);
    }
    invariant(n >= 0n, `Qty must be non-negative, got ${n}`);
    return new Qty(n);
  }

  add(other: Qty): Qty {
    return new Qty(this.n + other.n);
  }

  subtract(other: Qty): Qty {
    invariant(this.n >= other.n, `Qty subtraction underflow: ${this.n} - ${other.n}`);
    return new Qty(this.n - other.n);
  }

  compare(other: Qty): -1 | 0 | 1 {
    return this.n < other.n ? -1 : this.n > other.n ? 1 : 0;
  }

  equals(other: Qty): boolean {
    return this.n === other.n;
  }

  gt(other: Qty): boolean {
    return this.n > other.n;
  }

  gte(other: Qty): boolean {
    return this.n >= other.n;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  isPositive(): boolean {
    return this.n > 0n;
  }

  toBigInt(): bigint {
    return this.n;
  }

  toString(): string {
    return this.n.toString();
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Position cost basis: non-negative, 4 decimal places. */
export class Basis {
  private constructor(private readonly d: InstanceType<typeof Dec>) {}

  static fromString(value: string): Basis {
    invariant(BASIS_RE.test(value), `invalid Basis string: ${JSON.stringify(value)}`);
    return new Basis(new Dec(value));
  }

  static zero(): Basis {
    return new Basis(new Dec(0));
  }

  /** Adding a 2dp Money to a 4dp basis is exact — no rounding involved. */
  addMoney(m: Money): Basis {
    const next = this.d.plus(m.toDecimal());
    invariant(next.gte(0), `Basis cannot go negative: ${next.toString()}`);
    return new Basis(next);
  }

  /**
   * Allocate cost basis for selling `soldQty` out of `totalQty` (average-cost
   * method). The allocated amount is rounded to Money once; the final sell
   * allocates the exact remainder so the basis total never drifts (invariant 12).
   */
  allocate(soldQty: Qty, totalQty: Qty): { allocated: Money; remaining: Basis } {
    invariant(totalQty.isPositive(), "allocate requires a positive total quantity");
    invariant(soldQty.isPositive(), "allocate requires a positive sold quantity");
    invariant(totalQty.gte(soldQty), "cannot allocate more than the total quantity");
    if (soldQty.equals(totalQty)) {
      const all = Money.fromDecimalExact(this.d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN));
      // Any sub-cent residue in the basis is surfaced in the final allocation
      // (rounded once); remaining is exactly zero.
      return { allocated: all, remaining: Basis.zero() };
    }
    const allocated = Money.fromDecimalExact(
      this.d
        .mul(soldQty.toString())
        .div(totalQty.toString())
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
    );
    const remaining = this.d.minus(allocated.toDecimal());
    invariant(remaining.gte(0), "basis allocation produced a negative remainder");
    return { allocated, remaining: new Basis(remaining) };
  }

  /** Average cost per share at 4dp (display/derivation value; never stored). */
  avgPx(qty: Qty): Px {
    invariant(qty.isPositive(), "avgPx requires a positive quantity");
    return Px.fromString(this.d.div(qty.toString()).toFixed(4));
  }

  isZero(): boolean {
    return this.d.isZero();
  }

  toString(): string {
    return this.d.toFixed(4);
  }

  toJSON(): string {
    return this.toString();
  }
}

// ---------------------------------------------------------------------------
// Derivation helpers — each applies its single rounding step.
// ---------------------------------------------------------------------------

/** notional = round2(price × qty). The one rounding for a fill's cash value. */
export function notional(price: Px, qty: Qty): Money {
  return Money.fromDecimalExact(
    price.toDecimal().mul(qty.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
  );
}

/**
 * reserve = round2(price × qty × (1 + bufferRatio)) — market-buy reservation
 * (docs/architecture/FINANCIAL_INVARIANTS.md). bufferRatio like 0.025.
 */
export function reserveWithBuffer(price: Px, qty: Qty, bufferRatio: number): Money {
  invariant(bufferRatio >= 0 && bufferRatio < 1, `invalid buffer ratio ${bufferRatio}`);
  return Money.fromDecimalExact(
    price
      .toDecimal()
      .mul(qty.toString())
      .mul(new Dec(1).plus(new Dec(String(bufferRatio))))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
  );
}
