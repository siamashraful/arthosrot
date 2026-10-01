import { TOP100_SEED_ENTRIES, TOP100_SEED_AS_OF } from "./top100-seed";

/**
 * Browse catalog for the Markets screen. Sectors are curated here (GICS-style
 * groupings, largest companies first); the Top 100 is ranked by the backend
 * job and only falls back to the seed below until a snapshot exists.
 */

/** Icon keys the client maps to the Arthosrot icon set (components/icons) — no UI imports in core. */
export type SectorIcon =
  | "cpu"
  | "radio-tower"
  | "shopping-bag"
  | "shopping-cart"
  | "heart-pulse"
  | "landmark"
  | "factory"
  | "fuel"
  | "pickaxe"
  | "building"
  | "zap";

export interface Sector {
  slug: string;
  name: string;
  /** One plain-language sentence for a first-time investor. */
  blurb: string;
  icon: SectorIcon;
  companies: ReadonlyArray<{ symbol: string; name: string }>;
}

export const TOP100_LIST = "top-100";

export const TOP100_SEED = {
  asOf: TOP100_SEED_AS_OF,
  entries: TOP100_SEED_ENTRIES,
} as const;

export const SECTORS: readonly Sector[] = [
  {
    slug: "technology",
    name: "Technology",
    blurb:
      "Companies that make chips, computers, software and the cloud services businesses run on.",
    icon: "cpu",
    companies: [
      { symbol: "AAPL", name: "Apple" },
      { symbol: "MSFT", name: "Microsoft" },
      { symbol: "NVDA", name: "NVIDIA" },
      { symbol: "AVGO", name: "Broadcom" },
      { symbol: "ORCL", name: "Oracle" },
      { symbol: "CRM", name: "Salesforce" },
      { symbol: "ADBE", name: "Adobe" },
      { symbol: "AMD", name: "Advanced Micro Devices" },
      { symbol: "CSCO", name: "Cisco Systems" },
      { symbol: "INTC", name: "Intel" },
    ],
  },
  {
    slug: "communication-services",
    name: "Communication Services",
    blurb: "Search, social media, streaming and the networks that carry calls and data.",
    icon: "radio-tower",
    companies: [
      { symbol: "GOOGL", name: "Alphabet" },
      { symbol: "META", name: "Meta Platforms" },
      { symbol: "NFLX", name: "Netflix" },
      { symbol: "DIS", name: "Walt Disney" },
      { symbol: "T", name: "AT&T" },
      { symbol: "VZ", name: "Verizon" },
      { symbol: "TMUS", name: "T-Mobile US" },
      { symbol: "CMCSA", name: "Comcast" },
    ],
  },
  {
    slug: "consumer-discretionary",
    name: "Consumer Discretionary",
    blurb:
      "Things people buy when they have money to spare: cars, shopping, travel and eating out.",
    icon: "shopping-bag",
    companies: [
      { symbol: "AMZN", name: "Amazon" },
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "HD", name: "Home Depot" },
      { symbol: "MCD", name: "McDonald's" },
      { symbol: "NKE", name: "Nike" },
      { symbol: "SBUX", name: "Starbucks" },
      { symbol: "LOW", name: "Lowe's" },
      { symbol: "BKNG", name: "Booking Holdings" },
    ],
  },
  {
    slug: "consumer-staples",
    name: "Consumer Staples",
    blurb:
      "Everyday essentials people keep buying in good times and bad: food, drinks and household goods.",
    icon: "shopping-cart",
    companies: [
      { symbol: "WMT", name: "Walmart" },
      { symbol: "COST", name: "Costco" },
      { symbol: "PG", name: "Procter & Gamble" },
      { symbol: "KO", name: "Coca-Cola" },
      { symbol: "PEP", name: "PepsiCo" },
      { symbol: "PM", name: "Philip Morris International" },
      { symbol: "MDLZ", name: "Mondelez" },
      { symbol: "CL", name: "Colgate-Palmolive" },
    ],
  },
  {
    slug: "health-care",
    name: "Health Care",
    blurb: "Drug makers, insurers and the companies that build medical equipment and run labs.",
    icon: "heart-pulse",
    companies: [
      { symbol: "LLY", name: "Eli Lilly" },
      { symbol: "UNH", name: "UnitedHealth Group" },
      { symbol: "JNJ", name: "Johnson & Johnson" },
      { symbol: "ABBV", name: "AbbVie" },
      { symbol: "MRK", name: "Merck" },
      { symbol: "PFE", name: "Pfizer" },
      { symbol: "TMO", name: "Thermo Fisher Scientific" },
      { symbol: "ABT", name: "Abbott Laboratories" },
    ],
  },
  {
    slug: "financials",
    name: "Financials",
    blurb:
      "Banks, payment networks, insurers and investment firms — the businesses that move money.",
    icon: "landmark",
    companies: [
      { symbol: "BRK.B", name: "Berkshire Hathaway" },
      { symbol: "JPM", name: "JPMorgan Chase" },
      { symbol: "V", name: "Visa" },
      { symbol: "MA", name: "Mastercard" },
      { symbol: "BAC", name: "Bank of America" },
      { symbol: "WFC", name: "Wells Fargo" },
      { symbol: "GS", name: "Goldman Sachs" },
      { symbol: "AXP", name: "American Express" },
    ],
  },
  {
    slug: "industrials",
    name: "Industrials",
    blurb:
      "Planes, railroads, heavy machinery and delivery — the companies that build and move things.",
    icon: "factory",
    companies: [
      { symbol: "GE", name: "GE Aerospace" },
      { symbol: "CAT", name: "Caterpillar" },
      { symbol: "RTX", name: "RTX" },
      { symbol: "UNP", name: "Union Pacific" },
      { symbol: "HON", name: "Honeywell" },
      { symbol: "BA", name: "Boeing" },
      { symbol: "DE", name: "Deere & Company" },
      { symbol: "UPS", name: "United Parcel Service" },
    ],
  },
  {
    slug: "energy",
    name: "Energy",
    blurb: "Companies that find, produce, refine and transport oil and natural gas.",
    icon: "fuel",
    companies: [
      { symbol: "XOM", name: "Exxon Mobil" },
      { symbol: "CVX", name: "Chevron" },
      { symbol: "COP", name: "ConocoPhillips" },
      { symbol: "EOG", name: "EOG Resources" },
      { symbol: "SLB", name: "SLB" },
      { symbol: "MPC", name: "Marathon Petroleum" },
      { symbol: "PSX", name: "Phillips 66" },
      { symbol: "OXY", name: "Occidental Petroleum" },
    ],
  },
  {
    slug: "materials",
    name: "Materials",
    blurb: "Chemicals, metals, mining and paint — the raw materials other industries build with.",
    icon: "pickaxe",
    companies: [
      { symbol: "LIN", name: "Linde" },
      { symbol: "SHW", name: "Sherwin-Williams" },
      { symbol: "ECL", name: "Ecolab" },
      { symbol: "APD", name: "Air Products" },
      { symbol: "FCX", name: "Freeport-McMoRan" },
      { symbol: "NEM", name: "Newmont" },
      { symbol: "NUE", name: "Nucor" },
      { symbol: "DOW", name: "Dow" },
    ],
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    blurb: "Owners of warehouses, cell towers, data centres, malls and homes, mostly run as REITs.",
    icon: "building",
    companies: [
      { symbol: "PLD", name: "Prologis" },
      { symbol: "AMT", name: "American Tower" },
      { symbol: "EQIX", name: "Equinix" },
      { symbol: "WELL", name: "Welltower" },
      { symbol: "SPG", name: "Simon Property Group" },
      { symbol: "PSA", name: "Public Storage" },
      { symbol: "O", name: "Realty Income" },
      { symbol: "CCI", name: "Crown Castle" },
    ],
  },
  {
    slug: "utilities",
    name: "Utilities",
    blurb: "Electricity, gas and water providers — steady businesses that often pay dividends.",
    icon: "zap",
    companies: [
      { symbol: "NEE", name: "NextEra Energy" },
      { symbol: "SO", name: "Southern Company" },
      { symbol: "DUK", name: "Duke Energy" },
      { symbol: "AEP", name: "American Electric Power" },
      { symbol: "SRE", name: "Sempra" },
      { symbol: "D", name: "Dominion Energy" },
      { symbol: "EXC", name: "Exelon" },
      { symbol: "XEL", name: "Xcel Energy" },
    ],
  },
];
