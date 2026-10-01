const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** "30m" | "24h" | "7d" → milliseconds. The one format job intervals use. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value.trim());
  if (!match) throw new Error(`invalid duration ${JSON.stringify(value)} — use <n>m, <n>h or <n>d`);
  const ms = Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
  if (ms <= 0) throw new Error(`duration must be positive: ${value}`);
  return ms;
}
