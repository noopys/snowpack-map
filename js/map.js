// Map layer: basemap, SNOTEL station markers, alert polygons, radar overlay,
// and the map legend. Leaflet is loaded globally (window.L) by index.html.

import { THEMES, SEVERITY_COLORS, PCT_BINS, SWE_BINS, MAP_START, pctColor, sweColor } from './config.js';

const ATTR = {
  base: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  snow: ' · Snow: <a href="https://www.nrcs.usda.gov/wps/portal/wcc/home/">NRCS SNOTEL</a>',
  alerts: ' · Alerts: <a href="https://www.weather.gov/">NWS</a>',
  radar: ' · Radar: <a href="https://www.rainviewer.com/">RainViewer</a>',
};

let map;
let baseLayer;
let stationLayer;      // L.layerGroup of circleMarkers
let alertLayer;        // L.geoJSON
let radarLayers = new Map(); // frame index -> tileLayer
let radarData = null;  // { host, frames }
let radarOn = false;
let currentFrameIdx = 0;
let markersByTriplet = new Map();
let alertLayersById = new Map();
let selectedTriplet = null;

export function initMap() {
  map = L.map('map', {
    center: MAP_START.center,
    zoom: MAP_START.zoom,
    minZoom: 3,
    maxZoom: 14,
    zoomControl: false,
    preferCanvas: true,
    worldCopyJump: true,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.createPane('radar').style.zIndex = 350;
  map.createPane('alerts').style.zIndex = 380;
  map.createPane('stations').style.zIndex = 420;
  map.attributionControl.setPrefix(false);
  stationLayer = L.layerGroup().addTo(map);
  alertLayer = L.layerGroup().addTo(map);
  return map;
}

export function setBasemap(themeName) {
  const t = THEMES[themeName];
  if (baseLayer) baseLayer.remove();
  baseLayer = L.tileLayer(t.basemap, {
    attribution: ATTR.base + ATTR.snow + ATTR.alerts + ATTR.radar,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

function markerRadius(swe) {
  if (swe == null) return 3;
  if (swe <= 0) return 2.5;
  return Math.min(4 + Math.sqrt(swe) * 1.4, 13);
}

function fmtIn(v) {
  return v == null ? '–' : `${Number(v).toFixed(1)} in`;
}

/** (Re)draw all station markers for the given color mode / state filter / theme. */
export function renderStations(stations, { colorMode, stateFilter, themeName, onSelect }) {
  const t = THEMES[themeName];
  stationLayer.clearLayers();
  markersByTriplet.clear();
  for (const st of stations) {
    if (stateFilter && st.state !== stateFilter) continue;
    const color = colorMode === 'pct' ? pctColor(st.pctMedian, t) : sweColor(st.swe, t);
    const m = L.circleMarker([st.lat, st.lon], {
      pane: 'stations',
      radius: markerRadius(st.swe),
      fillColor: color,
      fillOpacity: 0.92,
      color: t.markerStroke,
      weight: 1,
    });
    const pct = st.pctMedian != null ? `${st.pctMedian}% of median` : 'no median for date';
    m.bindTooltip(
      `<strong>${escapeHtml(st.name)}</strong> · ${st.state}<br>` +
      `SWE ${fmtIn(st.swe)} · depth ${fmtIn(st.depth)}<br>${pct}`,
      { direction: 'top', offset: [0, -6], opacity: 1 },
    );
    m.on('click', () => onSelect?.(st.triplet));
    m.addTo(stationLayer);
    markersByTriplet.set(st.triplet, m);
  }
  if (selectedTriplet) highlightStation(selectedTriplet, themeName);
}

export function highlightStation(triplet, themeName) {
  const t = THEMES[themeName];
  if (selectedTriplet && markersByTriplet.has(selectedTriplet)) {
    markersByTriplet.get(selectedTriplet).setStyle({ color: t.markerStroke, weight: 1 });
  }
  selectedTriplet = triplet;
  const m = triplet && markersByTriplet.get(triplet);
  if (m) m.setStyle({ color: t.accent, weight: 3 }).bringToFront?.();
}

export function flyToStation(station) {
  map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 9), { duration: 0.8 });
}

/** (Re)draw alert polygons filtered to the active categories. */
export function renderAlerts(features, activeCategories, onSelect) {
  alertLayer.clearLayers();
  alertLayersById.clear();
  for (const f of features) {
    const a = f.properties;
    if (!activeCategories.has(a.category)) continue;
    const color = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.Unknown;
    const layer = L.geoJSON(f, {
      pane: 'alerts',
      style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.16 },
    });
    layer.bindPopup(alertPopupHtml(a), { maxWidth: 320 });
    layer.on('click', () => onSelect?.(a.id));
    layer.addTo(alertLayer);
    alertLayersById.set(a.id, layer);
  }
}

function alertPopupHtml(a) {
  const until = a.ends ? new Date(a.ends).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'further notice';
  const sev = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.Unknown;
  return `<div class="alert-pop">` +
    `<div class="alert-pop-title"><span class="sev-dot" style="background:${sev}"></span>${escapeHtml(a.event)}</div>` +
    `<div class="alert-pop-meta">${escapeHtml(a.severity)} · until ${escapeHtml(until)}</div>` +
    `<div class="alert-pop-area">${escapeHtml(truncate(a.areaDesc, 180))}</div></div>`;
}

/** Zoom to an alert's outline and open its popup. Returns false if it has no geometry. */
export function focusAlert(id) {
  const layer = alertLayersById.get(id);
  if (!layer) return false;
  map.fitBounds(layer.getBounds(), { maxZoom: 8, padding: [30, 30] });
  layer.openPopup();
  return true;
}

// ---------------- Radar ----------------

export function setRadarData(data) {
  radarData = data;
  for (const l of radarLayers.values()) l.remove();
  radarLayers.clear();
  currentFrameIdx = data.frames.length - 1;
}

export function radarFrameCount() {
  return radarData ? radarData.frames.length : 0;
}

function radarLayerFor(idx) {
  if (radarLayers.has(idx)) return radarLayers.get(idx);
  const f = radarData.frames[idx];
  const layer = L.tileLayer(`${radarData.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
    pane: 'radar',
    opacity: 0,
    tileSize: 256,
    maxNativeZoom: 7, // RainViewer serves error tiles past its native zoom
  });
  layer.addTo(map);
  radarLayers.set(idx, layer);
  return layer;
}

export function setRadarEnabled(on) {
  radarOn = on;
  if (!radarData) return;
  if (on) {
    showRadarFrame(currentFrameIdx);
  } else {
    for (const l of radarLayers.values()) l.setOpacity(0);
  }
}

/** Show one radar frame; returns its {time, nowcast} for the clock label. */
export function showRadarFrame(idx) {
  if (!radarData || !radarOn) return null;
  currentFrameIdx = idx;
  for (const [i, l] of radarLayers) {
    if (i !== idx) l.setOpacity(0);
  }
  radarLayerFor(idx).setOpacity(0.6);
  // Pre-warm the next frame's tiles so animation doesn't flicker.
  if (idx + 1 < radarData.frames.length) radarLayerFor(idx + 1);
  return radarData.frames[idx];
}

// ---------------- Legend ----------------

export function renderLegend(colorMode, themeName) {
  const t = THEMES[themeName];
  const el = document.getElementById('map-legend');
  if (!el) return;
  const rows = [];
  if (colorMode === 'pct') {
    const b = PCT_BINS;
    rows.push(['Snowpack — % of 30-yr median', null]);
    rows.push([`< ${b.below[0]}%`, t.pctBelow[3]], [`${b.below[0]}–${b.below[1]}%`, t.pctBelow[2]],
      [`${b.below[1]}–${b.below[2]}%`, t.pctBelow[1]], [`${b.below[2]}–${b.below[3]}%`, t.pctBelow[0]],
      [`${b.below[3]}–${b.neutralMax}% (near normal)`, t.pctNeutral],
      [`${b.neutralMax}–${b.above[0]}%`, t.pctAbove[0]], [`${b.above[0]}–${b.above[1]}%`, t.pctAbove[1]],
      [`${b.above[1]}–${b.above[2]}%`, t.pctAbove[2]], [`> ${b.above[2]}%`, t.pctAbove[3]],
      ['No median for this date', t.noData]);
  } else {
    rows.push(['Snow water equivalent (in)', null]);
    rows.push(['Melted out (0)', t.zeroSnow],
      [`< ${SWE_BINS[0]}`, t.sweRamp[0]], [`${SWE_BINS[0]}–${SWE_BINS[1]}`, t.sweRamp[1]],
      [`${SWE_BINS[1]}–${SWE_BINS[2]}`, t.sweRamp[2]], [`≥ ${SWE_BINS[2]}`, t.sweRamp[3]]);
  }
  rows.push(['Alert outline = NWS severity', null],
    ['Extreme', SEVERITY_COLORS.Extreme], ['Severe', SEVERITY_COLORS.Severe],
    ['Moderate', SEVERITY_COLORS.Moderate], ['Minor / unknown', SEVERITY_COLORS.Minor]);
  el.innerHTML = rows.map(([label, color]) => color
    ? `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${label}</div>`
    : `<div class="legend-title">${label}</div>`).join('');
}

// ---------------- utils ----------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function truncate(s, n) {
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
