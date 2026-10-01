import type { CSSProperties } from "react";
import {
  ArrowDownIcon,
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  BackspaceIcon,
  BankIcon,
  BellIcon,
  BroadcastIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartLineUpIcon,
  ChartPieSliceIcon,
  CheckIcon,
  ClockIcon,
  CoinsIcon,
  CompassIcon,
  CpuIcon,
  CreditCardIcon,
  CubeIcon,
  CurrencyBtcIcon,
  DotsThreeIcon,
  EyeIcon,
  EyeSlashIcon,
  FactoryIcon,
  FlameIcon,
  FunnelIcon,
  GearSixIcon,
  HandCoinsIcon,
  HeartbeatIcon,
  HouseIcon,
  InfoIcon,
  LightningIcon,
  ListChecksIcon,
  LockIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MoneyIcon,
  MonitorIcon,
  MoonIcon,
  NewspaperIcon,
  PercentIcon,
  PlusIcon,
  PulseIcon,
  RepeatIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SignOutIcon,
  SlidersIcon,
  StackIcon,
  StackSimpleIcon,
  StarIcon,
  SunIcon,
  TrendDownIcon,
  TrendUpIcon,
  TrophyIcon,
  UserIcon,
  WalletIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

/**
 * The app's ONE icon set: Phosphor (MIT), DUOTONE weight — a precise outline
 * with a soft 20%-opacity fill that gives each glyph depth and character
 * (docs/design/DESIGN.md Iconography; ADR-015). A deliberate, user-approved
 * deviation from the Claude Design system's generic Lucide-style set; every
 * other system rule (sizes, chips, semantic colour) still applies.
 *
 * Call sites use semantic names, never library components — swapping the set
 * is this file only. Weights: duotone for pictorial glyphs; regular for
 * controls (CONTROLS below); bold for small typographic glyphs (≤ 16px, e.g.
 * delta arrows and status tags) so they stay legible next to text; fill for
 * an "on" state (`filled`, the watchlist star).
 */
const GLYPHS = {
  // navigation and chrome
  home: HouseIcon,
  invest: ChartLineUpIcon,
  trade: ArrowsLeftRightIcon,
  transfer: ArrowsLeftRightIcon,
  spend: CreditCardIcon,
  discover: CompassIcon,
  search: MagnifyingGlassIcon,
  orders: ListChecksIcon,
  activity: PulseIcon,
  pie: ChartPieSliceIcon,
  settings: GearSixIcon,
  bell: BellIcon,
  user: UserIcon,
  logout: SignOutIcon,
  sun: SunIcon,
  moon: MoonIcon,
  monitor: MonitorIcon,
  more: DotsThreeIcon,
  filter: FunnelIcon,
  // controls
  plus: PlusIcon,
  minus: MinusIcon,
  check: CheckIcon,
  x: XIcon,
  "chevron-right": CaretRightIcon,
  "chevron-left": CaretLeftIcon,
  "chevron-down": CaretDownIcon,
  "arrow-right": ArrowRightIcon,
  "arrow-up": ArrowUpIcon,
  "arrow-down": ArrowDownIcon,
  "arrow-down-left": ArrowDownLeftIcon,
  "arrow-up-right": ArrowUpRightIcon,
  backspace: BackspaceIcon,
  star: StarIcon,
  eye: EyeIcon,
  "eye-off": EyeSlashIcon,
  lock: LockIcon,
  // status
  info: InfoIcon,
  alert: WarningIcon,
  clock: ClockIcon,
  shield: ShieldCheckIcon,
  calendar: CalendarBlankIcon,
  news: NewspaperIcon,
  percent: PercentIcon,
  repeat: RepeatIcon,
  // money and asset classes
  stocks: ChartLineUpIcon,
  positions: StackIcon,
  "trending-up": TrendUpIcon,
  "trending-down": TrendDownIcon,
  etf: StackSimpleIcon,
  options: SlidersIcon,
  crypto: CurrencyBtcIcon,
  cash: WalletIcon,
  banknote: MoneyIcon,
  dividend: CoinsIcon,
  realized: HandCoinsIcon,
  hand: HandCoinsIcon,
  // Markets browse
  trophy: TrophyIcon,
  technology: CpuIcon,
  communication: BroadcastIcon,
  "consumer-discretionary": ShoppingBagIcon,
  "consumer-staples": ShoppingCartIcon,
  "health-care": HeartbeatIcon,
  financials: BankIcon,
  industrials: FactoryIcon,
  energy: FlameIcon,
  materials: CubeIcon,
  "real-estate": BuildingsIcon,
  utilities: LightningIcon,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof GLYPHS;

/**
 * Controls are lines, not pictures: a duotone fill turns a caret into a
 * "play" triangle and an × into a blot, so these always draw in the regular
 * (outline) weight. Duotone is for pictorial glyphs — places, money, sectors.
 */
const CONTROLS = new Set<IconName>([
  "plus",
  "minus",
  "check",
  "x",
  "chevron-right",
  "chevron-left",
  "chevron-down",
  "arrow-right",
  "arrow-up",
  "arrow-down",
  "arrow-down-left",
  "arrow-up-right",
  "more",
]);

export function Icon({
  name,
  size = 24,
  stroke,
  className,
  style,
  filled = false,
}: {
  name: IconName;
  size?: number;
  /** Legacy hint from the stroke-based set: ≥ 2 asks for a heavier glyph. */
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
}) {
  const Glyph = GLYPHS[name];
  const weight = filled
    ? "fill"
    : size <= 16 || (stroke ?? 0) >= 2
      ? "bold"
      : CONTROLS.has(name)
        ? "regular"
        : "duotone";
  return (
    <Glyph
      className={`ar-icon${className ? ` ${className}` : ""}`}
      size={size}
      weight={weight}
      style={style}
      aria-hidden="true"
      focusable="false"
    />
  );
}
