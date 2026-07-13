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

/**
 * Downsample line points into fixed-width time buckets, averaging the values in
 * each bucket. `bucketSec <= 0` returns the points unchanged. Reduces overplot
 * and point count for long ranges / coarse resolutions.
 */
export function downsampleAvg(
  points: LinePoint[],
  bucketSec: number,
): LinePoint[] {
  if (bucketSec <= 0 || points.length < 2) return points;
  const out: LinePoint[] = [];
  let bucket = Math.floor(points[0].time / bucketSec);
  let sum = 0;
  let count = 0;
  let lastTime = points[0].time;
  for (const p of points) {
    const b = Math.floor(p.time / bucketSec);
    if (b !== bucket && count > 0) {
      out.push({ time: lastTime, value: sum / count });
      sum = 0;
      count = 0;
      bucket = b;
    }
    sum += p.value;
    count++;
    lastTime = p.time;
  }
  if (count > 0) out.push({ time: lastTime, value: sum / count });
  return out;
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
