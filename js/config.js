// Design tokens + data-source config shared by all modules.
// Colors follow the dataviz reference palette; ramp arms validated with
// scripts/validate_palette.js (ordinal mode) against both surfaces.

export const THEMES = {
  dark: {
    surface: '#1a1a19',
    page: '#0d0d0d',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    baseline: '#383835',
    border: 'rgba(255,255,255,0.10)',
    accent: '#3987e5',
    markerStroke: 'rgba(13,13,13,0.85)',
    // diverging %-of-median: red arm (below normal), neutral, blue arm (above).
    // On dark, intensity steps lighter outward from the gray midpoint.
    pctBelow: ['#b35c55', '#e66767', '#f79694', '#ffc2bf'], // 75–90, 50–75, 25–50, <25
    pctAbove: ['#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'], // 110–130, 130–160, 160–200, >=200
    pctNeutral: '#8f8e88',
    sweRamp: ['#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'],  // <5, 5–15, 15–30, >=30 in
    zeroSnow: '#4d4c48',
    noData: '#898781',
    basemap: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  },
  light: {
    surface: '#fcfcfb',
    page: '#f9f9f7',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    baseline: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    accent: '#2a78d6',
    markerStroke: 'rgba(252,252,251,0.9)',
    // On light, intensity steps darker outward.
    pctBelow: ['#e88a89', '#e34948', '#c22f2e', '#9c1f1f'],
    pctAbove: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
    pctNeutral: '#b5b3ab',
    sweRamp: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
    zeroSnow: '#d5d4cc',
    noData: '#898781',
    basemap: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  },
};

// Status palette (fixed, never themed) — NWS alert severity.
export const SEVERITY_COLORS = {
  Extreme: '#d03b3b',
  Severe: '#ec835a',
  Moderate: '#fab219',
  Minor: '#898781',
  Unknown: '#898781',
};

// % of median bin edges (shared by both arms). Values are upper bounds.
export const PCT_BINS = {
  below: [25, 50, 75, 90],   // <25, 25–50, 50–75, 75–90
  neutralMax: 110,           // 90–110 = near normal
  above: [130, 160, 200],    // 110–130, 130–160, 160–200, >=200
};

export const SWE_BINS = [5, 15, 30]; // <5, 5–15, 15–30, >=30 inches

export function pctColor(pct, t) {
  if (pct == null) return t.noData;
  const { below, neutralMax, above } = PCT_BINS;
  if (pct < below[0]) return t.pctBelow[3];
  if (pct < below[1]) return t.pctBelow[2];
  if (pct < below[2]) return t.pctBelow[1];
  if (pct < below[3]) return t.pctBelow[0];
  if (pct <= neutralMax) return t.pctNeutral;
  if (pct <= above[0]) return t.pctAbove[0];
  if (pct <= above[1]) return t.pctAbove[1];
  if (pct <= above[2]) return t.pctAbove[2];
  return t.pctAbove[3];
}

export function sweColor(swe, t) {
  if (swe == null) return t.noData;
  if (swe <= 0) return t.zeroSnow;
  if (swe < SWE_BINS[0]) return t.sweRamp[0];
  if (swe < SWE_BINS[1]) return t.sweRamp[1];
  if (swe < SWE_BINS[2]) return t.sweRamp[2];
  return t.sweRamp[3];
}

// Alert categories, keyword-matched against properties.event (first hit wins).
export const ALERT_CATEGORIES = [
  { id: 'winter',     label: 'Winter',       icon: '❄',  match: ['winter', 'blizzard', 'ice storm', 'snow', 'lake effect', 'avalanche', 'wind chill', 'freez', 'frost', 'cold'] },
  { id: 'tropical',   label: 'Tropical',     icon: '\u{1F300}', match: ['hurricane', 'tropical', 'storm surge', 'typhoon'] },
  { id: 'convective', label: 'Thunderstorm', icon: '⛈',  match: ['thunderstorm', 'tornado', 'severe weather'] },
  { id: 'flood',      label: 'Flood',        icon: '\u{1F4A7}', match: ['flood', 'hydrologic', 'dam '] },
  { id: 'wind',       label: 'Wind',         icon: '\u{1F32C}', match: ['wind', 'dust'] },
  { id: 'fire',       label: 'Fire',         icon: '\u{1F525}', match: ['fire', 'red flag', 'smoke'] },
  { id: 'heat',       label: 'Heat',         icon: '\u{1F321}', match: ['heat'] },
  { id: 'marine',     label: 'Marine',       icon: '⚓',  match: ['marine', 'small craft', 'gale', 'surf', 'beach', 'coastal', 'rip current', 'seas', 'waterspout', 'tsunami', 'storm warning', 'lakeshore'] },
  { id: 'other',      label: 'Other',        icon: '⚠',  match: [] }, // fallback
];

// Categories drawn/listed by default (marine + other start off to cut noise).
export const DEFAULT_CATEGORIES = ['winter', 'tropical', 'convective', 'flood', 'wind', 'fire', 'heat'];

export const SNOTEL_STATES = ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'OR', 'SD', 'UT', 'WA', 'WY'];

export const API = {
  awdb: 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1',
  nwsAlerts: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert,update',
  rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
};

export const MAP_START = { center: [41.5, -108.5], zoom: 5 };
export const HISTORY_DAYS = 120;      // station panel sparkline window
export const MIN_MEDIAN_IN = 0.5;     // below this, % of median is meaningless
export const RADAR_FRAME_MS = 650;    // animation cadence
