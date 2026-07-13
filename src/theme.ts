import type { DeepPartial, ChartOptions } from "lightweight-charts";
import { ColorType, LineStyle, CrosshairMode } from "lightweight-charts";

export interface ResolvedTheme {
  dark: boolean;
  text: string;
  textFaint: string;
  grid: string;
  crosshair: string;
  crosshairLabel: string;
  background: string;
}

export function resolveTheme(dark: boolean): ResolvedTheme {
  return dark
    ? {
        dark: true,
        text: "#E6E9EF",
        textFaint: "rgba(230,233,239,0.45)",
        grid: "rgba(255,255,255,0.045)",
        crosshair: "rgba(230,233,239,0.35)",
        crosshairLabel: "#2A2E39",
        background: "transparent",
      }
    : {
        dark: false,
        text: "#0F172A",
        textFaint: "rgba(15,23,42,0.45)",
        grid: "rgba(15,23,42,0.05)",
        crosshair: "rgba(15,23,42,0.35)",
        crosshairLabel: "#0F172A",
        background: "transparent",
      };
}

export function chartOptions(t: ResolvedTheme): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: t.background },
      textColor: t.textFaint,
      fontSize: 11,
      fontFamily:
        "var(--paper-font-body1_-_font-family, 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)",
      attributionLogo: false,
      // Subtle separators between stacked panes (the S7-trace look).
      panes: { separatorColor: t.grid, separatorHoverColor: t.crosshair, enableResize: true },
    },
    grid: {
      // Clean: horizontal guides only, vertical lines off.
      vertLines: { visible: false },
      horzLines: { color: t.grid, style: LineStyle.Solid },
    },
    rightPriceScale: { borderVisible: false, entireTextOnly: true },
    leftPriceScale: { borderVisible: false, entireTextOnly: true },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      uniformDistribution: true,
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: {
        color: t.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: t.crosshairLabel,
      },
      horzLine: {
        color: t.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: t.crosshairLabel,
      },
    },
    autoSize: true,
  };
}
