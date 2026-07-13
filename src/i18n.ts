export type Lang = "de" | "en";

type Entry = { de: string; en: string };

const STRINGS: Record<string, Entry> = {
  // Sections
  general: { de: "Allgemein", en: "General" },
  display: { de: "Anzeige", en: "Display" },
  series: { de: "Serien", en: "Series" },
  // General fields
  title: { de: "Titel", en: "Title" },
  height: { de: "Höhe (px)", en: "Height (px)" },
  theme: { de: "Design", en: "Theme" },
  hoursToShow: { de: "Geladene Stunden", en: "Hours loaded" },
  language: { de: "Sprache", en: "Language" },
  // Display toggles
  legend: { de: "Legende", en: "Legend" },
  tooltip: { de: "Tooltip", en: "Tooltip" },
  rangeButtons: { de: "Zeitraum-Buttons", en: "Range buttons" },
  resolutionButtons: { de: "Auflösungs-Buttons", en: "Resolution buttons" },
  uniformAxis: { de: "Einheitliche Zeitachse", en: "Uniform time axis" },
  autoPaneUnit: { de: "Auto-Pane pro Einheit", en: "Auto pane per unit" },
  // Series fields
  entity: { de: "Entity", en: "Entity" },
  name: { de: "Name", en: "Name" },
  type: { de: "Typ", en: "Type" },
  axis: { de: "Achse", en: "Axis" },
  color: { de: "Farbe", en: "Color" },
  pane: { de: "Pane", en: "Pane" },
  unit: { de: "Einheit", en: "Unit" },
  lineWidth: { de: "Linienbreite", en: "Line width" },
  fill: { de: "Füllung (0–1)", en: "Fill (0–1)" },
  decimals: { de: "Nachkommastellen", en: "Decimals" },
  factor: { de: "Faktor (× Wert)", en: "Factor (× value)" },
  baselineValue: { de: "Baseline-Wert", en: "Baseline value" },
  onStates: { de: "Als „An“ werten", en: 'Count as "on"' },
  addSeries: { de: "+ Serie hinzufügen", en: "+ Add series" },
  newSeries: { de: "Neue Serie", en: "New series" },
  remove: { de: "Entfernen", en: "Remove" },
  // Card toolbar
  resolution: { de: "Auflösung", en: "Resolution" },
  timeRange: { de: "Zeitraum", en: "Time range" },
  // Hints
  "hint.height": { de: "Höhe des Charts", en: "Chart height" },
  "hint.hoursToShow": {
    de: "Wie viel Daten geladen werden",
    en: "How much data is loaded",
  },
  "hint.theme": { de: "Standard oder Glas-Optik", en: "Default or glass look" },
  "hint.language": { de: "Sprache dieses Editors", en: "Language of this editor" },
  "hint.pane": { de: "Leer = automatisch", en: "Empty = automatic" },
  "hint.unit": {
    de: "Überschreibt die Sensor-Einheit",
    en: "Overrides the sensor's unit",
  },
  "hint.fill": { de: "Deckkraft der Fläche", en: "Area fill opacity" },
  "hint.decimals": {
    de: "Rundung in Tooltip & Legende",
    en: "Rounding in tooltip & legend",
  },
  "hint.factor": {
    de: "Rohwert × Faktor, z. B. 0.001 für W→kW",
    en: "raw × factor, e.g. 0.001 for W→kW",
  },
  "hint.baselineValue": {
    de: "Schwelle für ober-/unterhalb",
    en: "Threshold for above/below",
  },
  "hint.onStates": {
    de: "Diese Zustände = An, sonst Aus",
    en: "These states mean on; others off",
  },
};

/** Resolve the UI language from config, falling back to the HA language. */
export function resolveLang(
  configLang: string | undefined,
  hassLang: string | undefined,
): Lang {
  if (configLang === "de" || configLang === "en") return configLang;
  return (hassLang ?? "").toLowerCase().startsWith("de") ? "de" : "en";
}

export function t(lang: Lang, key: string): string {
  return STRINGS[key]?.[lang] ?? key;
}
