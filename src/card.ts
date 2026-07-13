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
import {
  fetchHistory,
  toLinePoints,
  toOhlcPoints,
  toBinaryPoints,
  onStateSet,
} from "./history";
import {
  CARD_TAG,
  EDITOR_TAG,
  CARD_VERSION,
  DEFAULT_RANGES,
  paletteColor,
  stateToBinary,
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
  @state() private loading = false;
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
    this.controller.setUniformDistribution(
      this.config.uniform_distribution ?? true,
    );
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
        ${this.loading && !this.error
          ? html`<div class="loading"><span class="spinner"></span></div>`
          : nothing}
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
    this.loading = true;
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
        let pts: LinePoint[] | OhlcPoint[];
        if (s.type === "candlestick") pts = toOhlcPoints(rows, s);
        else if (s.type === "binary") pts = toBinaryPoints(rows, s);
        else pts = toLinePoints(rows, s);
        controller.setData(i, pts);
        const last = pts[pts.length - 1];
        if (last) this.liveCursor[i] = last.time;
      });

      controller.fitContent();
      this.historyLoaded = true;
      this.error = undefined;
    } catch (e) {
      if (this.controller === controller) {
        this.error = `History load failed: ${(e as Error).message}`;
      }
    } finally {
      if (this.controller === controller) this.loading = false;
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
      } else if (s.type === "binary") {
        const v = stateToBinary(stateObj.state, onStateSet(s));
        if (v === null) return;
        this.controller!.updatePoint(i, { time, value: v });
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

  /**
   * Resolve a pane index per series. Precedence: explicit `pane` > binary
   * signals (grouped into their own slim pane below the graphs) >
   * auto-by-unit > main pane 0.
   */
  private resolvePanes(): number[] {
    const cfg = this.config!;
    const panes: number[] = new Array(cfg.series.length);
    const unitToPane = new Map<string, number>();
    let nextAnalog = 0;

    // Pass 1: analog series → main pane / unit panes / explicit panes.
    cfg.series.forEach((s, i) => {
      if (s.type === "binary") return;
      if (s.pane != null) {
        panes[i] = s.pane;
        nextAnalog = Math.max(nextAnalog, s.pane + 1);
      } else if (cfg.auto_pane_by_unit) {
        const unit = this.unitOf(s) ?? "";
        if (!unitToPane.has(unit)) unitToPane.set(unit, nextAnalog++);
        panes[i] = unitToPane.get(unit)!;
      } else {
        panes[i] = 0;
        nextAnalog = Math.max(nextAnalog, 1);
      }
    });

    // Pass 2: each binary signal gets its own slim pane, stacked below the
    // graphs (like a PLC / S7 trace). Explicit `pane` still wins and lets you
    // group several booleans into one lane on purpose.
    let nextBinary = nextAnalog;
    cfg.series.forEach((s, i) => {
      if (s.type !== "binary") return;
      panes[i] = s.pane ?? nextBinary++;
    });

    return panes;
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
        valStr =
          s.type === "binary"
            ? d.value >= 0.5
              ? "On"
              : "Off"
            : `${this.fmt(d.value, s)}${unit ? " " + esc(unit) : ""}`;
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
    // For booleans show the actual state text (on/open/closed/…).
    if (s.type === "binary") {
      const v = stateToBinary(stateObj.state, onStateSet(s));
      return v === null ? null : stateObj.state;
    }
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
    :host {
      --lwc-radius: 14px;
      --lwc-pad: 14px;
    }
    ha-card {
      overflow: hidden;
      border-radius: var(--lwc-radius);
    }
    /* Header: tighter, modern tracking. */
    ha-card {
      --ha-card-header-font-size: 1.05rem;
    }

    /* Segmented range control */
    .toolbar {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
      padding: 12px var(--lwc-pad) 2px;
    }
    .toolbar .range {
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--secondary-text-color);
      border-radius: 9px;
      padding: 4px 12px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      line-height: 1.5;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }
    .toolbar .range:hover {
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    }
    .toolbar .range:active {
      transform: scale(0.96);
    }
    .toolbar .range.active {
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      color: var(--primary-color);
    }

    .chart-wrap {
      position: relative;
    }
    .chart {
      width: 100%;
    }

    /* Loading */
    .loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .loading .spinner {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2.5px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
      border-top-color: var(--primary-color, #2962ff);
      animation: lwc-spin 0.7s linear infinite;
    }
    @keyframes lwc-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Glassy tooltip */
    .tooltip {
      position: absolute;
      z-index: 5;
      pointer-events: none;
      min-width: 132px;
      padding: 9px 11px;
      border-radius: 12px;
      font-size: 0.8rem;
      background: color-mix(in srgb, var(--card-background-color, #fff) 78%, transparent);
      -webkit-backdrop-filter: blur(14px) saturate(1.4);
      backdrop-filter: blur(14px) saturate(1.4);
      color: var(--primary-text-color);
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, transparent);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);
      transition: opacity 0.12s ease;
    }
    .tooltip[hidden] {
      display: none;
    }
    .tooltip .tt-time {
      font-weight: 700;
      font-size: 0.72rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-bottom: 6px;
      color: var(--secondary-text-color);
    }
    .tooltip .tt-row {
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      padding: 1px 0;
    }
    .tooltip .tt-dot {
      width: 8px;
      height: 8px;
      border-radius: 3px;
      flex: none;
    }
    .tooltip .tt-name {
      color: var(--secondary-text-color);
    }
    .tooltip .tt-val {
      margin-left: auto;
      padding-left: 14px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }

    /* Chip legend */
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px var(--lwc-pad) calc(var(--lwc-pad) + 2px);
      font-size: 0.82rem;
    }
    .legend .item {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-text-color) 5%, transparent);
    }
    .legend .dot {
      width: 9px;
      height: 9px;
      border-radius: 3px;
      display: inline-block;
    }
    .legend .name {
      color: var(--secondary-text-color);
      font-weight: 600;
    }
    .legend .val {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: var(--primary-text-color);
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
    "Slick, high-performance time-series charts — history, live, multi-pane, boolean signals — powered by TradingView Lightweight Charts.",
  preview: true,
  documentationURL:
    "https://github.com/YamahaRacing/lightweight-charts-card",
});

// eslint-disable-next-line no-console
console.info(
  `%c LIGHTWEIGHT-CHARTS-CARD %c v${CARD_VERSION} `,
  "color:white;background:#2962FF;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#2962FF;background:#1c1c1c;border-radius:0 3px 3px 0;padding:2px 4px",
);

// Lazy-load the editor only when the dashboard edit UI needs it.
import("./editor");
