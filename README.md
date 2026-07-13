# Lightweight Charts Card

[![GitHub release](https://img.shields.io/github/v/release/YamahaRacing/lightweight-charts-card?style=flat-square)](https://github.com/YamahaRacing/lightweight-charts-card/releases)
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A slick, high-performance chart card for **Home Assistant**, built on
[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5.
Canvas-rendered (not SVG/DOM), so it stays smooth even with long histories and
live-streaming sensors.

> This is a **custom Lovelace card** (frontend), not a Supervisor *add-on*.
> Lightweight Charts is a browser library, so charting lives in the dashboard.

<!-- Add screenshots to docs/ and reference them here, e.g.:
![Overview](docs/overview.png)
![Multi-pane](docs/multi-pane.png)
-->

## Install via HACS

1. HACS → **⋮** → **Custom repositories**
2. Repository: `https://github.com/YamahaRacing/lightweight-charts-card` · Category: **Dashboard**
3. Open the card entry → **Download**
4. Hard-refresh the browser (Ctrl/Cmd + F5). If your dashboard is in YAML mode,
   add the resource `/hacsfiles/lightweight-charts-card/lightweight-charts-card.js`
   as a **JavaScript Module**.

## Features

- 📈 **Sensor history** from the recorder (`history/history_during_period`)
- ⚡ **Live streaming** — new states are appended in real time
- 🕘 **Quick range buttons** (1h / 24h / 7d, fully configurable)
- 💬 **Rich crosshair tooltip** — time + per-series value & unit
- 🧱 **Multi-pane** — stack series in separate panes (e.g. kW vs °C), manual or auto-by-unit
- 🔲 **Boolean states** — render on/off entities as a stepped signal in a slim pane to see how a value reacts after a switch
- ⏳ **Loading spinner** while history is fetched
- 📏 **Uniformly distributed time axis** (`uniformDistribution`) + a clean, modern look (glassy tooltip, chip legend, subtle grid)
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

### Boolean states (see how a value reacts to a switch)

Use `type: binary` for on/off entities (valves, pumps, switches, binary
sensors). Each renders as a stepped 0/1 signal in **its own slim pane, stacked
below the graphs** (PLC / S7-trace style), time-aligned — so you can read
"valve opened here → temperature started rising". Group several booleans into
one lane by giving them the same `pane`.

```yaml
type: custom:lightweight-charts-card
title: Heating
height: 320
series:
  - entity: sensor.living_room_temperature
    name: Temperature
    type: line
    color: "#ff6d00"
  - entity: binary_sensor.heating_valve   # or switch.*, input_boolean.*
    name: Valve
    type: binary
    color: "#41bdf5"
```

States counted as "on" default to `on/open/home/true/…`; override per series
with `on_states: [heat, cool]`. Anything else is "off"; `unavailable`/`unknown`
are skipped.

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
| `uniform_distribution` | card | `true` | Distribute time-axis ticks uniformly (`uniformDistribution`) |
| `entity` | series | – | **Required.** Entity id |
| `name` | series | friendly_name | Legend label |
| `type` | series | `line` | line / area / baseline / histogram / candlestick / binary |
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
| `on_states` | series | on/open/… | States counted as "on" for `binary` |

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
