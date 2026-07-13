import type { HassEntity } from "home-assistant-js-websocket";

/** Minimal Home Assistant frontend interface we rely on. */
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  themes: { darkMode: boolean };
  language: string;
  locale?: { language: string; time_format?: string };
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  formatEntityState?(stateObj: HassEntity): string;
}

export type SeriesType =
  | "line"
  | "area"
  | "baseline"
  | "histogram"
  | "candlestick"
  | "binary";

export type AxisSide = "left" | "right";

export interface SeriesConfig {
  entity: string;
  name?: string;
  type?: SeriesType; // default: line
  color?: string;
  /** Second axis. Defaults to "right". */
  axis?: AxisSide;
  /**
   * Pane index (0 = main). Series with the same index share a stacked sub-pane.
   * Explicit `pane` always wins over `auto_pane_by_unit`.
   */
  pane?: number;
  /** Override the unit shown in tooltip/legend (e.g. "kW" after a factor). */
  unit?: string;
  /** Line width in px (line/area/baseline). */
  line_width?: number;
  /** Fill opacity 0..1 for area series. */
  fill_opacity?: number;
  /** Round displayed values to N decimals. */
  precision?: number;
  /** Multiply raw state (e.g. W -> kW with 0.001). */
  factor?: number;
  /** Baseline reference value for the "baseline" type. */
  baseline_value?: number;
  /**
   * For `type: binary` — states counted as "on" (=1). Case-insensitive.
   * Defaults to on/open/home/true/… Everything else (incl. off/closed) is 0.
   */
  on_states?: string[];
  /**
   * For candlestick series where a single entity exposes OHLC via attributes,
   * map attribute names here, e.g. { open: "open", high: "high", ... }.
   */
  ohlc_attributes?: {
    open: string;
    high: string;
    low: string;
    close: string;
  };
}

export interface RangePreset {
  label: string;
  hours: number;
}

export interface ResolutionPreset {
  label: string;
  seconds: number;
}

export interface ChartCardConfig {
  type: string;
  title?: string;
  /** Hours of recorder history to load initially. Default 24. */
  hours_to_show?: number;
  /** Card body height in px. Default 300. */
  height?: number;
  /** Visual style. `default` or `glass` (glassmorphism). Light/dark follows HA. */
  theme?: "default" | "glass";
  /** Editor + card UI language. Defaults to the HA language. */
  language?: "de" | "en";
  /** Show the built-in legend row. Default true. */
  show_legend?: boolean;
  /** Down-sample: only pull significant state changes. Default true. */
  significant_changes_only?: boolean;
  /** Quick range buttons. Defaults to 1h / 24h / 7d. */
  ranges?: RangePreset[];
  /** Toggle the range buttons. Default true (when >1 range). */
  show_range_buttons?: boolean;
  /** Crosshair tooltip. Default true. */
  tooltip?: boolean;
  /** Put each distinct unit on its own stacked pane. Default false. */
  auto_pane_by_unit?: boolean;
  /**
   * Distribute the time-axis tick marks uniformly instead of tying them to the
   * (irregular) data points. Maps to Lightweight Charts' `uniformDistribution`.
   * Default true.
   */
  uniform_distribution?: boolean;
  /** Resolution buttons (downsampling). Defaults to 1s/10s/30s/1m/5m/15m. */
  resolutions?: ResolutionPreset[];
  /** Toggle the resolution buttons. Default true. */
  show_resolution_buttons?: boolean;
  /** Active downsampling bucket in seconds (0 = full resolution). */
  resolution?: number;
  series: SeriesConfig[];
}

/** A single point in Lightweight Charts time (UNIX seconds). */
export interface LinePoint {
  time: number;
  value: number;
}

export interface OhlcPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Raw HA history rows returned by history/history_during_period. */
export interface HistoryRow {
  s: string; // state
  lu: number; // last_updated, epoch seconds (float)
  a?: Record<string, unknown>; // attributes (only when requested)
}
