import {
  createChart,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType as LwSeriesType,
  type UTCTimestamp,
  type LineWidth,
  type LineData,
  type CandlestickData,
  LineType,
} from "lightweight-charts";

import type { SeriesConfig, LinePoint, OhlcPoint } from "./types";
import { chartOptions, resolveTheme, type ResolvedTheme } from "./theme";
import { paletteColor } from "./const";

interface ManagedSeries {
  api: ISeriesApi<LwSeriesType>;
  cfg: SeriesConfig;
  paneIndex: number;
}

/** Any point we may feed to a series. */
type AnyPoint = LinePoint | OhlcPoint;

const asTime = (t: number): UTCTimestamp => t as UTCTimestamp;

/** Value at the crosshair for one series (line-like or OHLC), or undefined. */
export type CrosshairValue = LineData | CandlestickData | undefined;

export interface CrosshairEvent {
  time: number | null;
  values: CrosshairValue[];
  point: { x: number; y: number } | null;
}

/**
 * Thin, update-safe wrapper around a Lightweight Charts instance. We never
 * modify the library itself — everything here is composition on the public API.
 */
export class ChartController {
  private chart: IChartApi;
  private series: ManagedSeries[] = [];
  private theme: ResolvedTheme;

  constructor(container: HTMLElement, dark: boolean) {
    this.theme = resolveTheme(dark);
    this.chart = createChart(container, chartOptions(this.theme));
  }

  /**
   * (Re)build all series from config. Clears any existing series first.
   * `panes[i]` is the target pane index for series i (0 = main).
   */
  setSeries(configs: SeriesConfig[], panes?: number[]): void {
    for (const s of this.series) this.chart.removeSeries(s.api);
    this.series = [];

    configs.forEach((cfg, i) => {
      const color = cfg.color ?? paletteColor(i);
      const scaleId = cfg.axis === "left" ? "left" : "right";
      const paneIndex = panes?.[i] ?? cfg.pane ?? 0;
      const api = this.createSeries(cfg, color, scaleId, paneIndex);
      if (cfg.precision != null) {
        api.applyOptions({
          priceFormat: { type: "price", precision: cfg.precision, minMove: Math.pow(10, -cfg.precision) },
        });
      }
      this.series.push({ api, cfg, paneIndex });
    });

    // Only show the left scale if something actually uses it.
    const usesLeft = configs.some((c) => c.axis === "left");
    this.chart.priceScale("left").applyOptions({ visible: usesLeft });

    this.prunePanes();
    this.applyPaneStretch();
  }

  /** Give panes that only hold binary series a slim height. */
  private applyPaneStretch(): void {
    for (const pane of this.chart.panes()) {
      const cfgs = pane
        .getSeries()
        .map((api) => this.series.find((s) => s.api === api)?.cfg)
        .filter((c): c is SeriesConfig => !!c);
      if (!cfgs.length) continue;
      const allBinary = cfgs.every((c) => c.type === "binary");
      pane.setStretchFactor(allBinary ? 1 : 4);
    }
  }

  private createSeries(
    cfg: SeriesConfig,
    color: string,
    priceScaleId: string,
    paneIndex: number,
  ): ISeriesApi<LwSeriesType> {
    const type = cfg.type ?? "line";
    switch (type) {
      case "area":
        return this.chart.addSeries(
          AreaSeries,
          {
            lineColor: color,
            topColor: withAlpha(color, cfg.fill_opacity ?? 0.4),
            bottomColor: withAlpha(color, 0),
            lineWidth: (cfg.line_width ?? 2) as LineWidth,
            priceScaleId,
          },
          paneIndex,
        );
      case "baseline": {
        // Apply the configured color to both sides so `color` is honoured
        // (the library otherwise falls back to its teal/red defaults, which
        // reads as "wrong color / invisible" against an autoscaled chart).
        const fill = cfg.fill_opacity ?? 0.28;
        return this.chart.addSeries(
          BaselineSeries,
          {
            baseValue: { type: "price", price: cfg.baseline_value ?? 0 },
            topLineColor: color,
            topFillColor1: withAlpha(color, fill),
            topFillColor2: withAlpha(color, 0.02),
            bottomLineColor: color,
            bottomFillColor1: withAlpha(color, 0.02),
            bottomFillColor2: withAlpha(color, fill),
            lineWidth: (cfg.line_width ?? 2) as LineWidth,
            priceScaleId,
          },
          paneIndex,
        );
      }
      case "binary":
        // Stepped, filled 0/1 signal locked to a [0,1] scale — a clean square
        // wave for on/off states (valve open, pump running, …).
        return this.chart.addSeries(
          AreaSeries,
          {
            lineColor: color,
            topColor: withAlpha(color, cfg.fill_opacity ?? 0.45),
            bottomColor: withAlpha(color, 0.04),
            lineWidth: (cfg.line_width ?? 2) as LineWidth,
            lineType: LineType.WithSteps,
            priceScaleId,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: {
              type: "custom",
              minMove: 1,
              formatter: (v: number) => (v >= 0.5 ? "On" : "Off"),
            },
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: -0.08, maxValue: 1.08 },
            }),
          },
          paneIndex,
        );
      case "histogram":
        return this.chart.addSeries(
          HistogramSeries,
          { color, priceScaleId },
          paneIndex,
        );
      case "candlestick":
        return this.chart.addSeries(CandlestickSeries, { priceScaleId }, paneIndex);
      case "line":
      default:
        return this.chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: (cfg.line_width ?? 2) as LineWidth,
            priceScaleId,
          },
          paneIndex,
        );
    }
  }

  /** Remove any panes left empty after a rebuild (keeps the main pane 0). */
  private prunePanes(): void {
    const panes = this.chart.panes();
    for (let idx = panes.length - 1; idx >= 1; idx--) {
      if (panes[idx].getSeries().length === 0) {
        this.chart.removePane(idx);
      }
    }
  }

  /** Subscribe to crosshair movement; maps values back to series order. */
  subscribeCrosshair(cb: (e: CrosshairEvent) => void): void {
    this.chart.subscribeCrosshairMove((param) => {
      if (param.time == null || !param.point) {
        cb({ time: null, values: [], point: null });
        return;
      }
      const values = this.series.map(
        (s) => param.seriesData.get(s.api) as CrosshairValue,
      );
      cb({
        time: param.time as number,
        values,
        point: { x: param.point.x, y: param.point.y },
      });
    });
  }

  /** Bulk-load historical data for series index i. */
  setData(i: number, data: AnyPoint[]): void {
    const s = this.series[i];
    if (!s) return;
    const shaped = data.map((p) => ({ ...p, time: asTime(p.time) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.api.setData(shaped as any);
  }

  /** Append/replace the latest live point for series index i. */
  updatePoint(i: number, point: LinePoint | OhlcPoint): void {
    const s = this.series[i];
    if (!s) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.api.update({ ...point, time: asTime(point.time) } as any);
  }

  /** Read the value at the crosshair for the legend (or last value). */
  seriesConfigs(): SeriesConfig[] {
    return this.series.map((s) => s.cfg);
  }

  applyTheme(dark: boolean): void {
    this.theme = resolveTheme(dark);
    this.chart.applyOptions(chartOptions(this.theme));
  }

  /** Uniformly distribute time-axis tick marks (vs. tying them to data points). */
  setUniformDistribution(value: boolean): void {
    this.chart.timeScale().applyOptions({ uniformDistribution: value });
  }

  /** Locale used for axis date/number formatting (e.g. "de-DE"). */
  setLocale(locale: string): void {
    this.chart.applyOptions({ localization: { locale } });
  }

  /** Set the visible time window (seconds). Safe no-op if it can't be applied. */
  setVisibleRange(fromSec: number, toSec: number): void {
    try {
      this.chart.timeScale().setVisibleRange({
        from: fromSec as UTCTimestamp,
        to: toSec as UTCTimestamp,
      });
    } catch {
      // Range outside the data or chart not laid out yet — ignore.
    }
  }

  fitContent(): void {
    this.chart.timeScale().fitContent();
  }

  resize(): void {
    // autoSize handles most cases; this is a manual nudge after layout changes.
    this.chart.timeScale().fitContent();
  }

  destroy(): void {
    this.chart.remove();
    this.series = [];
  }
}

/** Turn "#RRGGBB" into an rgba() string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
