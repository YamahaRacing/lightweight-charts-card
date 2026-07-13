import type { RangePreset, ResolutionPreset } from "./types";

export const CARD_VERSION = "1.0.0";
export const CARD_TAG = "lightweight-charts-card";
export const EDITOR_TAG = "lightweight-charts-card-editor";

/** Default quick-range buttons. */
export const DEFAULT_RANGES: RangePreset[] = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

/** Default resolution (downsampling) buttons. */
export const DEFAULT_RESOLUTIONS: ResolutionPreset[] = [
  { label: "1s", seconds: 1 },
  { label: "10s", seconds: 10 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
];

/** States treated as "on" (=1) for `type: binary` unless overridden. */
export const DEFAULT_ON_STATES = [
  "on",
  "open",
  "opening",
  "home",
  "true",
  "yes",
  "active",
  "heat",
  "cool",
  "playing",
  "unlocked",
  "1",
];

/**
 * Map a Home Assistant state string to 0/1, or null for unknown/unavailable
 * (which should be skipped, not drawn as 0).
 */
export function stateToBinary(
  state: string,
  onStates: Set<string>,
): 0 | 1 | null {
  const s = String(state).toLowerCase();
  if (s === "unavailable" || s === "unknown" || s === "none" || s === "") {
    return null;
  }
  if (onStates.has(s)) return 1;
  const n = Number(s);
  if (Number.isFinite(n)) return n !== 0 ? 1 : 0;
  return 0;
}

/** A pleasant default series palette (TradingView-ish, colorblind-aware-ish). */
export const DEFAULT_PALETTE = [
  "#2962FF", // blue
  "#FF6D00", // orange
  "#00C853", // green
  "#D500F9", // purple
  "#FF1744", // red
  "#00B8D4", // cyan
  "#FFD600", // yellow
  "#6D4C41", // brown
];

export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}
