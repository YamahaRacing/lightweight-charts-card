import type { RangePreset } from "./types";

export const CARD_VERSION = "0.1.0";
export const CARD_TAG = "lightweight-charts-card";
export const EDITOR_TAG = "lightweight-charts-card-editor";

/** Default quick-range buttons. */
export const DEFAULT_RANGES: RangePreset[] = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

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
