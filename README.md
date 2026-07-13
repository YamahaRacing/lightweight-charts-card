# Lightweight Charts Card

A slick, high-performance chart card for **Home Assistant**, built on
[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5.
Canvas-rendered (not SVG/DOM), so it stays smooth even with long histories and
live-streaming sensors.

> This is a **custom Lovelace card** (frontend), not a Supervisor *add-on*.
> Lightweight Charts is a browser library, so charting lives in the dashboard.

## Features

- 📈 **Sensor history** from the recorder (`history/history_during_period`)
- ⚡ **Live streaming** — new states are appended in real time
- 🕘 **Quick range buttons** (1h / 24h / 7d, fully configurable)
- 💬 **Rich crosshair tooltip** — time + per-series value & unit
- 🧱 **Multi-pane** — stack series in separate panes (e.g. kW vs °C), manual or auto-by-unit
- 🪟 **Multiple series & dual axes** (left/right price scales)
- 🕯️ **Line, area, baseline, histogram & candlestick** series
- 🌗 Follows the Home Assistant light/dark theme automatically
- 🧩 Visual config editor + full YAML control
- 📦 One self-contained JS file (library is bundled, stays update-safe)

## Build

```bash
npm install
npm run build      # -> dist/lightweight-charts-card.js
npm run watch      # rebuild on change
npm run typecheck  # type safety without emitting
```

## Install (manual)

1. Copy `dist/lightweight-charts-card.js` to `config/www/` in Home Assistant.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/lightweight-charts-card.js`
   - Type: **JavaScript Module**
3. Add a card of type `custom:lightweight-charts-card`.

(Or install via **HACS** as a custom repository once published.)

## Configuration

```yaml
type: custom:lightweight-charts-card
title: Energy
hours_to_show: 24
height: 320
theme: auto          # auto | dark | light
show_legend: true
significant_changes_only: true
series:
  - entity: sensor.power_consumption
    name: Power
    type: area
    color: "#2962FF"
    factor: 0.001      # W -> kW
    precision: 2
    axis: left
  - entity: sensor.electricity_price
    name: Price
    type: line
    axis: right
```

### Multi-pane (different units on stacked panes)

Give each series a `pane` index — series sharing an index share a pane, pane `0`
is the main one. Or let the card group units automatically:

```yaml
type: custom:lightweight-charts-card
title: House
height: 420
auto_pane_by_unit: true    # kW series -> pane 0, °C series -> pane 1, ...
ranges:
  - { label: "6h",  hours: 6 }
  - { label: "24h", hours: 24 }
  - { label: "7d",  hours: 168 }
series:
  - entity: sensor.power_total
    name: Power
    type: area
    factor: 0.001
    unit: kW           # display unit after factor
    precision: 2
  - entity: sensor.living_room_temperature
    name: Living room
  - entity: sensor.bedroom_temperature
    name: Bedroom
```

Explicit panes instead of auto-grouping:

```yaml
series:
  - entity: sensor.power_total   # pane omitted -> 0 (main)
  - entity: sensor.temperature
    pane: 1                       # its own stacked pane
```

### Candlestick from OHLC attributes

Candlesticks need Open/High/Low/Close. Point the series at an entity whose
**attributes** carry those values:

```yaml
series:
  - entity: sensor.stock_aapl
    type: candlestick
    ohlc_attributes:
      open: open
      high: high
      low: low
      close: close
```

## Options reference

| Key | Scope | Default | Description |
|-----|-------|---------|-------------|
| `title` | card | – | Card header |
| `hours_to_show` | card | `24` | Recorder window in hours |
| `height` | card | `300` | Chart body height (px) |
| `theme` | card | `auto` | `auto` follows HA dark mode |
| `show_legend` | card | `true` | Toggle the legend row |
| `significant_changes_only` | card | `true` | Down-sample history fetch |
| `ranges` | card | 1h/24h/7d | Quick-range buttons (`{label, hours}[]`) |
| `show_range_buttons` | card | `true` | Toggle the range buttons |
| `tooltip` | card | `true` | Crosshair tooltip |
| `auto_pane_by_unit` | card | `false` | Put each distinct unit on its own pane |
| `entity` | series | – | **Required.** Entity id |
| `name` | series | friendly_name | Legend label |
| `type` | series | `line` | line / area / baseline / histogram / candlestick |
| `color` | series | palette | Series color (`#RRGGBB`) |
| `axis` | series | `right` | `left` or `right` price scale |
| `pane` | series | `0` | Pane index (stacked sub-charts) |
| `unit` | series | entity unit | Display unit override (tooltip/legend) |
| `line_width` | series | `2` | Line thickness (px) |
| `fill_opacity` | series | `0.4` | Area fill alpha (0–1) |
| `factor` | series | `1` | Multiply raw state |
| `precision` | series | – | Decimal places |
| `baseline_value` | series | `0` | Reference for `baseline` |
| `ohlc_attributes` | series | – | Attribute map for candlesticks |

## Architecture

```
src/
├── card.ts     LitElement custom card: config, history load, live updates, legend
├── chart.ts    Lightweight Charts v5 wrapper (composition over the public API)
├── history.ts  Recorder fetch + row → point mapping
├── editor.ts   Visual GUI config editor
├── theme.ts    Light/dark chart theming
├── types.ts    Shared types
└── const.ts    Tags, version, default palette
```

The library is **never patched** — it is bundled as a dependency and driven
through its public options/series/primitives API, so upgrades stay painless.

## License

MIT
