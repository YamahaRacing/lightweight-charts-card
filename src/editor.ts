import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { HomeAssistant, ChartCardConfig, SeriesConfig } from "./types";
import { EDITOR_TAG, CARD_TAG } from "./const";

/**
 * Lightweight visual editor. It covers the common options plus a per-series
 * list; advanced keys (ohlc_attributes, baseline_value, …) can still be set in
 * YAML mode and are preserved untouched.
 */
@customElement(EDITOR_TAG)
export class LightweightChartsCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private config?: ChartCardConfig;

  public setConfig(config: ChartCardConfig): void {
    this.config = config;
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

  private updateRoot(key: keyof ChartCardConfig, value: unknown): void {
    if (!this.config) return;
    this.emit({ ...this.config, [key]: value });
  }

  private updateSeries(i: number, patch: Partial<SeriesConfig>): void {
    if (!this.config) return;
    const series = this.config.series.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s,
    );
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

  protected override render() {
    if (!this.config) return nothing;
    const c = this.config;
    const entityIds = this.hass ? Object.keys(this.hass.states) : [];

    return html`
      <div class="form">
        <label>Title
          <input
            .value=${c.title ?? ""}
            @input=${(e: Event) =>
              this.updateRoot("title", (e.target as HTMLInputElement).value)}
          />
        </label>

        <div class="row">
          <label>Hours to show
            <input type="number" min="1" .value=${String(c.hours_to_show ?? 24)}
              @input=${(e: Event) =>
                this.updateRoot("hours_to_show",
                  Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <label>Height (px)
            <input type="number" min="80" .value=${String(c.height ?? 300)}
              @input=${(e: Event) =>
                this.updateRoot("height",
                  Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <label>Theme
            <select
              @change=${(e: Event) =>
                this.updateRoot("theme", (e.target as HTMLSelectElement).value)}
            >
              ${["auto", "dark", "light"].map(
                (t) => html`<option value=${t}
                  ?selected=${(c.theme ?? "auto") === t}>${t}</option>`,
              )}
            </select>
          </label>
        </div>

        <div class="series-head">
          <span>Series</span>
          <button class="add" @click=${this.addSeries}>+ Add</button>
        </div>

        ${c.series.map((s, i) => this.renderSeriesRow(s, i, entityIds))}
      </div>
    `;
  }

  private renderSeriesRow(s: SeriesConfig, i: number, entityIds: string[]) {
    return html`<div class="series">
      <label class="grow">Entity
        <input
          list="lwc-entities"
          .value=${s.entity}
          @input=${(e: Event) =>
            this.updateSeries(i, { entity: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label>Name
        <input .value=${s.name ?? ""}
          @input=${(e: Event) =>
            this.updateSeries(i, { name: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label>Type
        <select @change=${(e: Event) =>
          this.updateSeries(i, {
            type: (e.target as HTMLSelectElement).value as SeriesConfig["type"],
          })}>
          ${["line", "area", "baseline", "histogram", "candlestick"].map(
            (t) => html`<option value=${t}
              ?selected=${(s.type ?? "line") === t}>${t}</option>`,
          )}
        </select>
      </label>
      <label>Axis
        <select @change=${(e: Event) =>
          this.updateSeries(i, {
            axis: (e.target as HTMLSelectElement).value as SeriesConfig["axis"],
          })}>
          ${["right", "left"].map(
            (t) => html`<option value=${t}
              ?selected=${(s.axis ?? "right") === t}>${t}</option>`,
          )}
        </select>
      </label>
      <label class="color">Color
        <input type="color" .value=${s.color ?? "#2962FF"}
          @input=${(e: Event) =>
            this.updateSeries(i, { color: (e.target as HTMLInputElement).value })}
        />
      </label>
      <button class="del" @click=${() => this.removeSeries(i)}>✕</button>
      <datalist id="lwc-entities">
        ${entityIds.map((id) => html`<option value=${id}></option>`)}
      </datalist>
    </div>`;
  }

  static override styles = css`
    .form { display: flex; flex-direction: column; gap: 12px; padding: 8px 4px; }
    label { display: flex; flex-direction: column; font-size: 0.8rem;
      color: var(--secondary-text-color); gap: 4px; }
    input, select { padding: 6px 8px; border-radius: 6px;
      border: 1px solid var(--divider-color, #ccc);
      background: var(--card-background-color); color: var(--primary-text-color); }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row label { flex: 1; min-width: 90px; }
    .series-head { display: flex; align-items: center; justify-content: space-between;
      margin-top: 8px; font-weight: 600; color: var(--primary-text-color); }
    .series { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;
      padding: 8px; border: 1px solid var(--divider-color, #eee); border-radius: 8px; }
    .series .grow { flex: 2; min-width: 160px; }
    .series label { flex: 1; min-width: 90px; }
    .series .color { flex: 0; }
    button { cursor: pointer; border: none; border-radius: 6px; padding: 6px 10px;
      background: var(--primary-color); color: var(--text-primary-color, #fff); }
    button.del { background: var(--error-color, #db4437); align-self: flex-end; }
  `;
}

// Referenced so bundlers keep the tag name in sync with the card.
void CARD_TAG;
