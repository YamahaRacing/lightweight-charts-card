import type { DeepPartial, ChartOptions } from "lightweight-charts";
import { ColorType } from "lightweight-charts";

export interface ResolvedTheme {
  dark: boolean;
  text: string;
  grid: string;
  border: string;
  background: string;
}

export function resolveTheme(dark: boolean): ResolvedTheme {
  return dark
    ? {
        dark: true,
        text: "#D1D4DC",
        grid: "rgba(255,255,255,0.06)",
        border: "rgba(255,255,255,0.12)",
        background: "transparent",
      }
    : {
        dark: false,
        text: "#131722",
        grid: "rgba(0,0,0,0.06)",
        border: "rgba(0,0,0,0.12)",
        background: "transparent",
      };
}

export function chartOptions(t: ResolvedTheme): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: t.background },
      textColor: t.text,
      fontFamily:
        "var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif)",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: t.grid },
      horzLines: { color: t.grid },
    },
    rightPriceScale: { borderColor: t.border },
    leftPriceScale: { borderColor: t.border },
    timeScale: {
      borderColor: t.border,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      mode: 1, // Magnet
      vertLine: { color: t.border, labelBackgroundColor: t.text },
      horzLine: { color: t.border, labelBackgroundColor: t.text },
    },
    autoSize: true,
  };
}
