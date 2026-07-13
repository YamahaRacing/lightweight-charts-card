import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { HomeAssistant, ChartCardConfig, SeriesConfig } from "./types";
import { EDITOR_TAG, paletteColor } from "./const";
import { resolveLang, t, type Lang } from "./i18n";

const SERIES_TYPES = [
  "line",
  "area",
  "baseline",
  "histogram",
  "candlestick",
  "binary",
];

/**
 * Grouped, modern visual editor. Card options live in collapsible sections;
 * each series is an expandable card. Advanced keys not surfaced here are still
 * editable via YAML and preserved untouched.
 */
@customElement(EDITOR_TAG)
export class LightweightChartsCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private config?: ChartCardConfig;

  public setConfig(config: ChartCardConfig): void {
    this.config = config;
  }

  private uiLang(): Lang {
    return resolveLang(this.config?.language, this.hass?.language);
  }

  private emit(next: ChartCardConfig): void {
    this.config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private setRoot(key: keyof ChartCardConfig, value: unknown): void {
    if (!this.config) return;
    const next = { ...this.config } as Record<string, unknown>;
    if (value === undefined || value === "") delete next[key as string];
    else next[key as string] = value;
    this.emit(next as unknown as ChartCardConfig);
  }

  private setSeries(i: number, patch: Partial<SeriesConfig>): void {
    if (!this.config) return;
    const series = this.config.series.map((s, idx) => {
      if (idx !== i) return s;
      const merged = { ...s, ...patch } as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") delete merged[k];
      }
      return merged as unknown as SeriesConfig;
    });
    this.emit({ ...this.config, series });
  }

  private addSeries(): void {
    if (!this.config) return;
    this.emit({
      ...this.config,
      series: [...this.config.series, { entity: "", type: "line" }],
    });
  }

  private removeSeries(i: number): void {
    if (!this.config) return;
    this.emit({
      ...this.config,
      series: this.config.series.filter((_, idx) => idx !== i),
    });
  }

  // ---- Field helpers ------------------------------------------------------

  private hint(text?: string): TemplateResult | typeof nothing {
    return text ? html`<small class="hint">${text}</small>` : nothing;
  }

  private text(
    label: string,
    value: string | undefined,
    on: (v: string | undefined) => void,
    list?: string,
    placeholder?: string,
    hint?: string,
  ): TemplateResult {
    return html`<label class="field"
      ><span>${label}</span>
      <input
        .value=${value ?? ""}
        list=${list ?? nothing}
        placeholder=${placeholder ?? nothing}
        @input=${(e: Event) => on((e.target as HTMLInputElement).value)}
      />
      ${this.hint(hint)}
    </label>`;
  }

  private num(
    label: string,
    value: number | undefined,
    on: (v: number | undefined) => void,
    opts: { min?: number; step?: number; placeholder?: string; hint?: string } = {},
  ): TemplateResult {
    return html`<label class="field"
      ><span>${label}</span>
      <input
        type="number"
        min=${opts.min ?? nothing}
        step=${opts.step ?? nothing}
        placeholder=${opts.placeholder ?? nothing}
        .value=${value == null ? "" : String(value)}
        @input=${(e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          on(v === "" ? undefined : Number(v));
        }}
      />
      ${this.hint(opts.hint)}
    </label>`;
  }

  private select(
    label: string,
    value: string,
    options: Array<string | { value: string; label: string }>,
    on: (v: string) => void,
    hint?: string,
  ): TemplateResult {
    const opts = options.map((o) =>
      typeof o === "string" ? { value: o, label: o } : o,
    );
    return html`<label class="field"
      ><span>${label}</span>
      <select @change=${(e: Event) => on((e.target as HTMLSelectElement).value)}>
        ${opts.map(
          (o) => html`<option value=${o.value} ?selected=${o.value === value}>
            ${o.label}
          </option>`,
        )}
      </select>
      ${this.hint(hint)}
    </label>`;
  }

  private color(
    label: string,
    value: string,
    on: (v: string) => void,
  ): TemplateResult {
    return html`<label class="field color"
      ><span>${label}</span>
      <input
        type="color"
        .value=${value}
        @input=${(e: Event) => on((e.target as HTMLInputElement).value)}
      />
    </label>`;
  }

  private check(
    label: string,
    checked: boolean,
    on: (v: boolean) => void,
  ): TemplateResult {
    return html`<label class="toggle">
      <input
        type="checkbox"
        .checked=${checked}
        @change=${(e: Event) => on((e.target as HTMLInputElement).checked)}
      />
      <span class="track"></span>
      <span class="tlabel">${label}</span>
    </label>`;
  }

  private section(
    title: string,
    open: boolean,
    body: TemplateResult,
  ): TemplateResult {
    return html`<details class="section" ?open=${open}>
      <summary>${title}</summary>
      <div class="section-body">${body}</div>
    </details>`;
  }

  // ---- Render -------------------------------------------------------------

  protected override render() {
    if (!this.config) return nothing;
    const c = this.config;
    const l = this.uiLang();
    const tr = (k: string) => t(l, k);
    const entityIds = this.hass ? Object.keys(this.hass.states) : [];

    return html`
      <div class="editor">
        <datalist id="lwc-entities">
          ${entityIds.map((id) => html`<option value=${id}></option>`)}
        </datalist>
        ${this.section(
          tr("general"),
          true,
          html`<div class="grid">
            ${this.text(tr("title"), c.title, (v) => this.setRoot("title", v))}
            ${this.num(tr("height"), c.height, (v) => this.setRoot("height", v), {
              min: 80,
              placeholder: "300",
              hint: tr("hint.height"),
            })}
            ${this.select(
              tr("theme"),
              c.theme ?? "default",
              ["default", "glass"],
              (v) => this.setRoot("theme", v),
              tr("hint.theme"),
            )}
            ${this.select(
              tr("language"),
              l,
              [
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
              ],
              (v) => this.setRoot("language", v),
              tr("hint.language"),
            )}
            ${this.num(
              tr("hoursToShow"),
              c.hours_to_show,
              (v) => this.setRoot("hours_to_show", v),
              { min: 1, placeholder: "24", hint: tr("hint.hoursToShow") },
            )}
          </div>`,
        )}
        ${this.section(
          tr("display"),
          true,
          html`<div class="checks">
            ${this.check(tr("legend"), c.show_legend !== false, (v) =>
              this.setRoot("show_legend", v),
            )}
            ${this.check(tr("tooltip"), c.tooltip !== false, (v) =>
              this.setRoot("tooltip", v),
            )}
            ${this.check(tr("rangeButtons"), c.show_range_buttons !== false, (v) =>
              this.setRoot("show_range_buttons", v),
            )}
            ${this.check(
              tr("resolutionButtons"),
              c.show_resolution_buttons !== false,
              (v) => this.setRoot("show_resolution_buttons", v),
            )}
            ${this.check(
              tr("uniformAxis"),
              c.uniform_distribution !== false,
              (v) => this.setRoot("uniform_distribution", v),
            )}
            ${this.check(tr("autoPaneUnit"), !!c.auto_pane_by_unit, (v) =>
              this.setRoot("auto_pane_by_unit", v),
            )}
          </div>`,
        )}
        ${this.section(
          `${tr("series")} (${c.series.length})`,
          true,
          html`${c.series.map((s, i) => this.seriesCard(s, i, l))}
            <button class="add" @click=${() => this.addSeries()}>
              ${tr("addSeries")}
            </button>`,
        )}
      </div>
    `;
  }

  private seriesCard(s: SeriesConfig, i: number, l: Lang): TemplateResult {
    const tr = (k: string) => t(l, k);
    const color = s.color ?? paletteColor(i);
    const title = s.name || s.entity || tr("newSeries");
    const type = s.type ?? "line";
    const isBinary = type === "binary";
    const hasLineWidth = ["line", "area", "baseline", "binary"].includes(type);
    const hasFill = ["area", "baseline", "binary"].includes(type);
    return html`<details class="series" open>
      <summary>
        <span class="dot" style=${`background:${color}`}></span>
        <span class="stitle">${title}</span>
        <span class="stype">${type}</span>
        <button
          class="del"
          title=${tr("remove")}
          @click=${(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeSeries(i);
          }}
        >
          ✕
        </button>
      </summary>
      <div class="grid">
        ${this.text(
          tr("entity"),
          s.entity,
          (v) => this.setSeries(i, { entity: v ?? "" }),
          "lwc-entities",
        )}
        ${this.text(tr("name"), s.name, (v) => this.setSeries(i, { name: v }))}
        ${this.select(tr("type"), type, SERIES_TYPES, (v) =>
          this.setSeries(i, { type: v as SeriesConfig["type"] }),
        )}
        ${this.select(
          tr("axis"),
          s.axis ?? "right",
          ["right", "left"],
          (v) => this.setSeries(i, { axis: v as SeriesConfig["axis"] }),
        )}
        ${this.color(tr("color"), color, (v) => this.setSeries(i, { color: v }))}
        ${this.num(tr("pane"), s.pane, (v) => this.setSeries(i, { pane: v }), {
          min: 0,
          placeholder: "auto",
          hint: tr("hint.pane"),
        })}
        ${isBinary
          ? nothing
          : this.text(
              tr("unit"),
              s.unit,
              (v) => this.setSeries(i, { unit: v }),
              undefined,
              undefined,
              tr("hint.unit"),
            )}
        ${hasLineWidth
          ? this.num(
              tr("lineWidth"),
              s.line_width,
              (v) => this.setSeries(i, { line_width: v }),
              { min: 1, step: 1, placeholder: "2" },
            )
          : nothing}
        ${hasFill
          ? this.num(
              tr("fill"),
              s.fill_opacity,
              (v) => this.setSeries(i, { fill_opacity: v }),
              { min: 0, step: 0.05, placeholder: "0.4", hint: tr("hint.fill") },
            )
          : nothing}
        ${isBinary
          ? nothing
          : this.num(
              tr("decimals"),
              s.precision,
              (v) => this.setSeries(i, { precision: v }),
              { min: 0, step: 1, hint: tr("hint.decimals") },
            )}
        ${isBinary
          ? nothing
          : this.num(
              tr("factor"),
              s.factor,
              (v) => this.setSeries(i, { factor: v }),
              { step: 0.001, placeholder: "1", hint: tr("hint.factor") },
            )}
        ${type === "baseline"
          ? this.num(
              tr("baselineValue"),
              s.baseline_value,
              (v) => this.setSeries(i, { baseline_value: v }),
              { step: 0.1, placeholder: "0", hint: tr("hint.baselineValue") },
            )
          : nothing}
        ${isBinary
          ? this.text(
              tr("onStates"),
              (s.on_states ?? []).join(", "),
              (v) =>
                this.setSeries(i, {
                  on_states: v
                    ? v
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean)
                    : undefined,
                }),
              undefined,
              "on, open, heat",
              tr("hint.onStates"),
            )
          : nothing}
      </div>
    </details>`;
  }

  static override styles = css`
    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 2px;
    }
    .section {
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
      border-radius: 12px;
      overflow: hidden;
      background: color-mix(in srgb, var(--primary-text-color, #000) 3%, transparent);
    }
    .section > summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 14px;
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--primary-text-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section > summary::-webkit-details-marker {
      display: none;
    }
    .section > summary::before {
      content: "▸";
      font-size: 0.7rem;
      opacity: 0.6;
      transition: transform 0.15s ease;
    }
    .section[open] > summary::before {
      transform: rotate(90deg);
    }
    .section-body {
      padding: 4px 14px 14px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.72rem;
      color: var(--secondary-text-color);
    }
    .field > span {
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .field .hint {
      font-size: 0.68rem;
      line-height: 1.3;
      color: color-mix(in srgb, var(--secondary-text-color) 85%, transparent);
      opacity: 0.85;
    }
    input,
    select {
      padding: 7px 9px;
      border-radius: 8px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 0.85rem;
    }
    input:focus,
    select:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .field.color input[type="color"] {
      padding: 2px;
      height: 34px;
      cursor: pointer;
    }

    .checks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px 16px;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      cursor: pointer;
      font-size: 0.82rem;
      color: var(--primary-text-color);
      user-select: none;
    }
    .toggle input {
      display: none;
    }
    .toggle .track {
      position: relative;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-text-color) 20%, transparent);
      transition: background 0.15s ease;
      flex: none;
    }
    .toggle .track::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.15s ease;
    }
    .toggle input:checked + .track {
      background: var(--primary-color);
    }
    .toggle input:checked + .track::after {
      transform: translateX(16px);
    }

    .series {
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
      border-left: 3px solid var(--primary-color);
      border-radius: 10px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .series > summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 12px;
    }
    .series > summary::-webkit-details-marker {
      display: none;
    }
    .series .dot {
      width: 11px;
      height: 11px;
      border-radius: 3px;
      flex: none;
    }
    .series .stitle {
      font-weight: 600;
      color: var(--primary-text-color);
    }
    .series .stype {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
      padding: 1px 7px;
      border-radius: 999px;
    }
    .series .grid {
      padding: 2px 12px 14px;
    }
    .series .del {
      margin-left: auto;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--error-color, #db4437);
      font-size: 0.95rem;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .series .del:hover {
      background: color-mix(in srgb, var(--error-color, #db4437) 15%, transparent);
    }

    button.add {
      width: 100%;
      cursor: pointer;
      border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4));
      background: transparent;
      color: var(--primary-color);
      border-radius: 10px;
      padding: 9px;
      font-weight: 600;
      font-size: 0.85rem;
    }
    button.add:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }

    datalist {
      display: none;
    }
  `;
}
