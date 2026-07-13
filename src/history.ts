import type {
  HomeAssistant,
  SeriesConfig,
  LinePoint,
  OhlcPoint,
  HistoryRow,
} from "./types";
import { DEFAULT_ON_STATES, stateToBinary } from "./const";

/**
 * Fetch recorder history for a set of entities over the last `hours` hours.
 * Uses the modern `history/history_during_period` WebSocket command, which is
 * far lighter than the legacy REST history endpoint.
 */
export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  hours: number,
  significantChangesOnly: boolean,
  needAttributes: boolean,
): Promise<Record<string, HistoryRow[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);

  const result = await hass.callWS<Record<string, HistoryRow[]>>({
    type: "history/history_during_period",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: entityIds,
    minimal_response: !needAttributes,
    no_attributes: !needAttributes,
    significant_changes_only: significantChangesOnly,
  });

  return result ?? {};
}

const isFiniteNum = (n: number): boolean => Number.isFinite(n);

/** Convert HA history rows into numeric line points for one series. */
export function toLinePoints(
  rows: HistoryRow[] | undefined,
  cfg: SeriesConfig,
): LinePoint[] {
  if (!rows?.length) return [];
  const factor = cfg.factor ?? 1;
  const out: LinePoint[] = [];
  let lastTime = -Infinity;

  for (const row of rows) {
    const value = Number(row.s) * factor;
    if (!isFiniteNum(value)) continue; // skip "unavailable"/"unknown"
    // Lightweight Charts requires strictly ascending, unique timestamps.
    const time = Math.floor(row.lu);
    if (time <= lastTime) continue;
    lastTime = time;
    out.push({ time, value });
  }
  return out;
}

/** A point with no value — breaks the line / marks a data gap. */
export type Whitespace = { time: number };

function medianDelta(points: LinePoint[]): number {
  if (points.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push(points[i].time - points[i - 1].time);
  }
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] || 0;
}

/**
 * Split a series into the drawable line (with whitespace inserted so it doesn't
 * paint a misleading straight line across missing data) and a "gap" dataset
 * that bridges each gap — rendered as a faint dashed line. `gapSec <= 0` picks
 * an automatic threshold from the median sampling interval.
 */
export function splitGaps(
  points: LinePoint[],
  gapSec: number,
): { main: Array<LinePoint | Whitespace>; gap: Array<LinePoint | Whitespace> } {
  const main: Array<LinePoint | Whitespace> = [];
  const gap: Array<LinePoint | Whitespace> = [];
  if (points.length < 2) return { main: [...points], gap };

  const threshold =
    gapSec > 0 ? gapSec : Math.max(120, medianDelta(points) * 8);

  let lastGapEndIdx = -2;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    main.push(p);
    if (i < points.length - 1) {
      const next = points[i + 1];
      if (next.time - p.time > threshold) {
        // Break the coloured line across the gap.
        const mid = Math.floor((p.time + next.time) / 2);
        if (mid > p.time && mid < next.time) main.push({ time: mid });
        // Bridge the gap with the dashed overlay.
        if (i === lastGapEndIdx) {
          gap.push({ time: next.time, value: next.value });
        } else {
          if (gap.length) {
            const prev = gap[gap.length - 1].time;
            const w = Math.floor((prev + p.time) / 2);
            if (w > prev && w < p.time) gap.push({ time: w });
          }
          gap.push({ time: p.time, value: p.value });
          gap.push({ time: next.time, value: next.value });
        }
        lastGapEndIdx = i + 1;
      }
    }
  }
  return { main, gap };
}

/** Build the "on" state set for a binary series (lower-cased). */
export function onStateSet(cfg: SeriesConfig): Set<string> {
  return new Set(
    (cfg.on_states ?? DEFAULT_ON_STATES).map((s) => s.toLowerCase()),
  );
}

/** Convert HA history rows into a 0/1 step signal for a binary series. */
export function toBinaryPoints(
  rows: HistoryRow[] | undefined,
  cfg: SeriesConfig,
): LinePoint[] {
  if (!rows?.length) return [];
  const onStates = onStateSet(cfg);
  const out: LinePoint[] = [];
  let lastTime = -Infinity;
  let lastValue: number | null = null;

  for (const row of rows) {
    const value = stateToBinary(row.s, onStates);
    if (value === null) continue; // skip unavailable/unknown
    const time = Math.floor(row.lu);
    if (time <= lastTime) continue;
    // Collapse consecutive identical states — a step line only needs edges.
    if (value === lastValue) continue;
    lastTime = time;
    lastValue = value;
    out.push({ time, value });
  }
  return out;
}

/** Convert rows into OHLC points using per-row attribute mapping. */
export function toOhlcPoints(
  rows: HistoryRow[] | undefined,
  cfg: SeriesConfig,
): OhlcPoint[] {
  if (!rows?.length || !cfg.ohlc_attributes) return [];
  const { open, high, low, close } = cfg.ohlc_attributes;
  const factor = cfg.factor ?? 1;
  const out: OhlcPoint[] = [];
  let lastTime = -Infinity;

  for (const row of rows) {
    const a = row.a;
    if (!a) continue;
    const o = Number(a[open]) * factor;
    const h = Number(a[high]) * factor;
    const l = Number(a[low]) * factor;
    const c = Number(a[close]) * factor;
    if (![o, h, l, c].every(isFiniteNum)) continue;
    const time = Math.floor(row.lu);
    if (time <= lastTime) continue;
    lastTime = time;
    out.push({ time, open: o, high: h, low: l, close: c });
  }
  return out;
}
