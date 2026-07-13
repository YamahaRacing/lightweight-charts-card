import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";

import type {
  HomeAssistant,
  ChartCardConfig,
  SeriesConfig,
  LinePoint,
  OhlcPoint,
} from "./types";
import { ChartController, type CrosshairEvent } from "./chart";
import { fetchHistory, toLinePoints, toOhlcPoints } from "./history";
import {
  CARD_TAG,
  EDITOR_TAG,
  CARD_VERSION,
  DEFAULT_RANGES,
  paletteColor,
} from "./const";
import type { RangePreset } from "./types";

const isDark = (hass?: HomeAssistant): boolean => !!hass?.themes?.darkMode;

/** Escape untrusted text before injecting into the tooltip innerHTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@customElement(CARD_TAG)
export class LightweightChartsCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private config?: ChartCardConfig;
  @state() private error?: string;
  @state() private activeHours = 24;
  @query(".chart") private chartEl!: HTMLDivElement;
  @query(".tooltip") private tooltipEl?: HTMLDivElement;

  private controller?: ChartController;
  private lastDark = false;
  /** last_updated (epoch s) already pushed live, per series index. */
  private liveCursor: number[] = [];
  private historyLoaded = false;

  // ---- Home Assistant card lifecycle -------------------------------------

  public setConfig(config: ChartCardConfig): void {
    if (!config?.series?.length) {
      throw new Error("You must define at least one entity in `series`.");
    }
    for (const s of config.series) {
      if (!s.entity) throw new Error("Each series needs an `entity`.");
    }
    this.config = config;
    this.historyLoaded = false;
    this.activeHours = config.hours_to_show ?? this.activeHours ?? 24;
    // Rebuild series on next render if the chart already exists.
    if (this.controller) {
      this.controller.setSeries(config.series, this.resolvePanes());
      this.liveCursor = config.series.map(() => -Infinity);
      void this.loadHistory();
    }
  }

  public getCardSize(): number {
    return Math.ceil((this.config?.height ?? 300) / 50);
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TAG);
  }

  public static getStubConfig(): Partial<ChartCardConfig> {
    return { type: `custom:${CARD_TAG}`, hours_to_show: 24, series: [] };
  }

  // ---- Rendering ----------------------------------------------------------

  protected override firstUpdated(): void {
    this.initChart();
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    // Home Assistant disconnects/reconnects cards during layout (Sections view,
    // lazy rendering, drag). firstUpdated only fires once, so rebuild the chart
    // here if it was torn down on a previous disconnect.
    if (this.hasUpdated && !this.controller) this.initChart();
  }

  /** Create the chart on the (already rendered) .chart element and load data. */
  private initChart(): void {
    if (!this.config || this.controller || !this.chartEl) return;
    this.lastDark = isDark(this.hass);
    this.controller = new ChartController(this.chartEl, this.lastDark);
    this.controller.setSeries(this.config.series, this.resolvePanes());
    this.liveCursor = this.config.series.map(() => -Infinity);
    if (this.config.tooltip !== false) {
      this.controller.subscribeCrosshair((e) => this.updateTooltip(e));
    }
    void this.loadHistory();
  }

  protected override updated(changed: PropertyValues): void {
    if (!this.controller || !this.config) return;

    // React to HA light/dark theme switches.
    const dark = isDark(this.hass);
    if (dark !== this.lastDark) {
      this.lastDark = dark;
      this.controller.applyTheme(dark);
    }

    // Live updates: only after the initial history bulk-load is in place.
    if (changed.has("hass") && this.historyLoaded) {
      this.pushLive();
    }
  }

  protected override render() {
    if (this.error) {
      return html`<ha-card .header=${this.config?.title}>
        <div class="error">${this.error}</div>
      </ha-card>`;
    }
    return html`<ha-card .header=${this.config?.title}>
      ${this.renderToolbar()}
      <div class="chart-wrap">
        <div
          class="chart"
          style=${`height:${this.config?.height ?? 300}px`}
        ></div>
        <div class="tooltip" hidden></div>
      </div>
      ${this.renderLegend()}
    </ha-card>`;
  }

  private renderToolbar() {
    if (!this.config || this.config.show_range_buttons === false) return nothing;
    const ranges = this.effectiveRanges();
    if (ranges.length < 2) return nothing;
    return html`<div class="toolbar">
      ${ranges.map(
        (r) => html`<button
          class=${`range${this.activeHours === r.hours ? " active" : ""}`}
          @click=${() => this.selectRange(r.hours)}
        >
          ${r.label}
        </button>`,
      )}
    </div>`;
  }

  private effectiveRanges(): RangePreset[] {
    return this.config?.ranges ?? DEFAULT_RANGES;
  }

  private selectRange(hours: number): void {
    if (this.activeHours === hours) return;
    this.activeHours = hours;
    this.historyLoaded = false;
    void this.loadHistory();
  }

  private renderLegend() {
    if (!this.config || this.config.show_legend === false) return nothing;
    return html`<div class="legend">
      ${this.config.series.map((s, i) => {
        const color = s.color ?? paletteColor(i);
        const label = s.name ?? this.entityName(s.entity);
        const val = this.currentValue(s);
        return html`<span class="item">
          <span class="dot" style=${`background:${color}`}></span>
          <span class="name">${label}</span>
          ${val != null ? html`<span class="val">${val}</span>` : nothing}
        </span>`;
      })}
    </div>`;
  }

  // ---- Data ---------------------------------------------------------------

  private async loadHistory(): Promise<void> {
    const controller = this.controller;
    if (!this.hass || !this.config || !controller) return;
    const cfg = this.config;
    try {
      const entityIds = cfg.series.map((s) => s.entity);
      const needAttributes = cfg.series.some((s) => !!s.ohlc_attributes);

      const raw = await fetchHistory(
        this.hass,
        entityIds,
        this.activeHours,
        cfg.significant_changes_only ?? true,
        needAttributes,
      );

      // The card may have been disconnected/rebuilt while awaiting the fetch —
      // in that case `this.controller` is a different (or no) instance. Bail out
      // instead of writing into a destroyed chart.
      if (this.controller !== controller || !this.isConnected) return;

      cfg.series.forEach((s, i) => {
        const rows = raw[s.entity];
        if (s.type === "candlestick") {
          const pts = toOhlcPoints(rows, s);
          controller.setData(i, pts);
          const last = pts[pts.length - 1];
          if (last) this.liveCursor[i] = last.time;
        } else {
          const pts = toLinePoints(rows, s);
          controller.setData(i, pts);
          const last = pts[pts.length - 1];
          if (last) this.liveCursor[i] = last.time;
        }
      });

      controller.fitContent();
      this.historyLoaded = true;
      this.error = undefined;
    } catch (e) {
      if (this.controller === controller) {
        this.error = `History load failed: ${(e as Error).message}`;
      }
    }
  }

  /** Append the newest state of each entity as a live point. */
  private pushLive(): void {
    if (!this.hass || !this.config) return;
    this.config.series.forEach((s, i) => {
      const stateObj = this.hass!.states[s.entity];
      if (!stateObj) return;
      const time = Math.floor(
        new Date(stateObj.last_updated).getTime() / 1000,
      );
      if (time <= this.liveCursor[i]) return; // nothing new

      if (s.type === "candlestick" && s.ohlc_attributes) {
        const a = stateObj.attributes;
        const map = s.ohlc_attributes;
        const factor = s.factor ?? 1;
        const pt: OhlcPoint = {
          time,
          open: Number(a[map.open]) * factor,
          high: Number(a[map.high]) * factor,
          low: Number(a[map.low]) * factor,
          close: Number(a[map.close]) * factor,
        };
        if (![pt.open, pt.high, pt.low, pt.close].every(Number.isFinite)) return;
        this.controller!.updatePoint(i, pt);
      } else {
        const value = Number(stateObj.state) * (s.factor ?? 1);
        if (!Number.isFinite(value)) return;
        const pt: LinePoint = { time, value };
        this.controller!.updatePoint(i, pt);
      }
      this.liveCursor[i] = time;
    });
  }

  // ---- Panes --------------------------------------------------------------

  /** Resolve a pane index per series (explicit `pane` > auto-by-unit > 0). */
  private resolvePanes(): number[] {
    const cfg = this.config!;
    if (!cfg.auto_pane_by_unit) {
      return cfg.series.map((s) => s.pane ?? 0);
    }
    const unitToPane = new Map<string, number>();
    let next = 0;
    return cfg.series.map((s) => {
      if (s.pane != null) return s.pane;
      const unit = this.unitOf(s) ?? "";
      if (!unitToPane.has(unit)) unitToPane.set(unit, next++);
      return unitToPane.get(unit)!;
    });
  }

  // ---- Tooltip ------------------------------------------------------------

  private updateTooltip(e: CrosshairEvent): void {
    const el = this.tooltipEl;
    if (!el || !this.config) return;
    if (e.time == null || !e.point) {
      el.setAttribute("hidden", "");
      return;
    }
    const lang = this.hass?.language || "en";
    const timeStr = new Date(e.time * 1000).toLocaleString(lang, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let rows = "";
    this.config.series.forEach((s, i) => {
      const d = e.values[i];
      if (d == null) return;
      const color = s.color ?? paletteColor(i);
      const name = esc(s.name ?? this.entityName(s.entity));
      const unit = this.unitOf(s);
      let valStr: string;
      if (d && "close" in d) {
        const f = (n: number) => this.fmt(n, s);
        valStr = `O ${f(d.open)} · H ${f(d.high)} · L ${f(d.low)} · C ${f(d.close)}`;
      } else if (d && "value" in d && typeof d.value === "number") {
        valStr = `${this.fmt(d.value, s)}${unit ? " " + esc(unit) : ""}`;
      } else {
        return;
      }
      rows +=
        `<div class="tt-row"><span class="tt-dot" style="background:${color}"></span>` +
        `<span class="tt-name">${name}</span><span class="tt-val">${valStr}</span></div>`;
    });

    if (!rows) {
      el.setAttribute("hidden", "");
      return;
    }
    el.innerHTML = `<div class="tt-time">${timeStr}</div>${rows}`;
    el.removeAttribute("hidden");

    // Position within the chart, flipping near the right/bottom edges.
    const wrap = el.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    let left = e.point.x + 14;
    if (left + el.offsetWidth > w) left = e.point.x - el.offsetWidth - 14;
    let top = e.point.y + 14;
    if (top + el.offsetHeight > h) top = e.point.y - el.offsetHeight - 14;
    el.style.left = `${Math.max(4, left)}px`;
    el.style.top = `${Math.max(4, top)}px`;
  }

  private fmt(n: number, s: SeriesConfig): string {
    return s.precision != null
      ? n.toFixed(s.precision)
      : String(Math.round(n * 1000) / 1000);
  }

  private unitOf(s: SeriesConfig): string | undefined {
    return (
      s.unit ?? this.hass?.states[s.entity]?.attributes?.unit_of_measurement
    );
  }

  // ---- Helpers ------------------------------------------------------------

  private entityName(entityId: string): string {
    return (
      this.hass?.states[entityId]?.attributes?.friendly_name ?? entityId
    );
  }

  private currentValue(s: SeriesConfig): string | null {
    const stateObj = this.hass?.states[s.entity];
    if (!stateObj) return null;
    const raw = Number(stateObj.state) * (s.factor ?? 1);
    if (!Number.isFinite(raw)) return null;
    const num =
      s.precision != null ? raw.toFixed(s.precision) : String(raw);
    const unit = this.unitOf(s);
    return unit ? `${num} ${unit}` : num;
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.controller?.destroy();
    this.controller = undefined;
    this.historyLoaded = false;
  }

  static override styles = css`
    ha-card {
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      padding: 8px 12px 0;
    }
    .toolbar .range {
      cursor: pointer;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      background: transparent;
      color: var(--secondary-text-color);
      border-radius: 999px;
      padding: 3px 12px;
      font-size: 0.8rem;
      line-height: 1.4;
      transition: all 0.12s ease;
    }
    .toolbar .range:hover {
      color: var(--primary-text-color);
    }
    .toolbar .range.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .chart-wrap {
      position: relative;
    }
    .chart {
      width: 100%;
    }
    .tooltip {
      position: absolute;
      z-index: 5;
      pointer-events: none;
      min-width: 120px;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 0.8rem;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    }
    .tooltip[hidden] {
      display: none;
    }
    .tooltip .tt-time {
      font-weight: 600;
      margin-bottom: 4px;
      opacity: 0.75;
    }
    .tooltip .tt-row {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .tooltip .tt-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex: none;
    }
    .tooltip .tt-name {
      opacity: 0.85;
    }
    .tooltip .tt-val {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 8px 16px 14px;
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }
    .legend .item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .legend .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .legend .name {
      color: var(--primary-text-color);
    }
    .legend .val {
      font-variant-numeric: tabular-nums;
      opacity: 0.85;
    }
    .error {
      padding: 16px;
      color: var(--error-color, #db4437);
    }
  `;
}

// Register in the card picker.
(window as unknown as { customCards?: unknown[] }).customCards ??= [];
(window as unknown as { customCards: unknown[] }).customCards.push({
  type: CARD_TAG,
  name: "Lightweight Charts Card",
  description:
    "Slick, high-performance time-series charts (line, area, candlestick) powered by TradingView Lightweight Charts.",
  preview: true,
  documentationURL: "https://github.com/your-name/lightweight-charts-card",
});

// eslint-disable-next-line no-console
console.info(
  `%c LIGHTWEIGHT-CHARTS-CARD %c v${CARD_VERSION} `,
  "color:white;background:#2962FF;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#2962FF;background:#1c1c1c;border-radius:0 3px 3px 0;padding:2px 4px",
);

// Lazy-load the editor only when the dashboard edit UI needs it.
import("./editor");
