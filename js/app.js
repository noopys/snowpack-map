// Orchestration: loads data, owns app state, wires UI <-> map.

import { DEFAULT_CATEGORIES, MIN_MEDIAN_IN, RADAR_FRAME_MS, SNOTEL_STATES, THEMES } from './config.js';
import * as api from './api.js';
import * as mapMod from './map.js';
import * as ui from './ui.js';

const state = {
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  colorMode: 'pct',
  stateFilter: '',
  activeCategories: new Set(DEFAULT_CATEGORIES),
  stations: [],
  alerts: [],
  alertFeatures: [],
  selectedStation: null,
  userSetColorMode: false,
  historyCache: new Map(),
  radar: { frames: 0, playing: false, timer: null, idx: 0 },
};

const SEV_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

// ---------- derived renders ----------

function visibleStations() {
  return state.stateFilter ? state.stations.filter((s) => s.state === state.stateFilter) : state.stations;
}

function redrawStations() {
  mapMod.renderStations(state.stations, {
    colorMode: state.colorMode,
    stateFilter: state.stateFilter,
    themeName: state.theme,
    onSelect: selectStation,
  });
  const top = [...visibleStations()]
    .filter((s) => s.swe != null)
    .sort((a, b) => b.swe - a.swe)
    .slice(0, 10);
  ui.renderTopStations(top, THEMES[state.theme], state.colorMode);
  mapMod.renderLegend(state.colorMode, state.theme);
}

function redrawAlerts() {
  mapMod.renderAlerts(state.alertFeatures, state.activeCategories, selectAlert);
  const counts = new Map();
  for (const a of state.alerts) counts.set(a.category, (counts.get(a.category) || 0) + 1);
  ui.renderAlertChips(counts, state.activeCategories);
  const list = state.alerts
    .filter((a) => state.activeCategories.has(a.category))
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || a.event.localeCompare(b.event))
    .slice(0, 400);
  ui.renderAlertList(list);
}

function redrawKPIs() {
  const reporting = state.stations.filter((s) => s.swe != null);
  const withNormal = reporting.filter((s) => s.pctMedian != null && s.median >= MIN_MEDIAN_IN);
  const pct = withNormal.length >= 10
    ? Math.round(withNormal.reduce((sum, s) => sum + s.pctMedian, 0) / withNormal.length)
    : null;
  ui.renderKPIs({
    stationsReporting: reporting.length,
    stationsTotal: state.stations.length,
    pctOfNormal: pct,
    pctCount: withNormal.length,
    winterAlerts: state.alerts.filter((a) => a.category === 'winter').length,
    totalAlerts: state.alerts.length,
  });
}

// ---------- selection ----------

async function selectStation(triplet) {
  const st = state.stations.find((s) => s.triplet === triplet);
  if (!st) return;
  state.selectedStation = st;
  mapMod.highlightStation(triplet, state.theme);
  mapMod.flyToStation(st);
  let history = state.historyCache.get(triplet);
  ui.showStationPanel(st, history || [], THEMES[state.theme]);
  if (!history) {
    ui.setStatus(`Loading history for ${st.name}…`);
    try {
      history = await api.fetchStationHistory(triplet);
      state.historyCache.set(triplet, history);
      if (state.selectedStation?.triplet === triplet) ui.showStationPanel(st, history, THEMES[state.theme]);
      ui.setStatus('');
    } catch (err) {
      ui.setStatus(`History failed: ${err.message}`, true);
    }
  }
}

function selectAlert(id) {
  const ok = mapMod.focusAlert(id);
  if (!ok) ui.setStatus('That alert is issued by zone and has no map outline.', false);
}

// ---------- radar ----------

function radarEls() {
  return {
    toggle: document.getElementById('btn-radar-toggle'),
    play: document.getElementById('btn-radar-play'),
    slider: document.getElementById('radar-slider'),
    time: document.getElementById('radar-time'),
  };
}

function setRadarControlsEnabled(on) {
  const { toggle, play, slider, time } = radarEls();
  toggle?.classList.toggle('on', on);
  if (play) play.disabled = !on;
  if (slider) slider.disabled = !on;
  time?.classList.toggle('dim', !on);
}

function showFrame(idx) {
  const { slider, time } = radarEls();
  const frame = mapMod.showRadarFrame(idx);
  state.radar.idx = idx;
  if (slider) slider.value = String(idx);
  if (frame && time) {
    const d = new Date(frame.time * 1000);
    const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    time.textContent = frame.nowcast ? `${label} (forecast)` : label;
  }
}

function stopRadarLoop() {
  const { play } = radarEls();
  clearInterval(state.radar.timer);
  state.radar.playing = false;
  if (play) play.textContent = '▶';
}

function toggleRadarPlay() {
  const { play } = radarEls();
  if (state.radar.playing) {
    stopRadarLoop();
    return;
  }
  state.radar.playing = true;
  if (play) play.textContent = '⏸';
  state.radar.timer = setInterval(() => {
    showFrame((state.radar.idx + 1) % state.radar.frames);
  }, RADAR_FRAME_MS);
}

function initRadarBar() {
  const { toggle, play, slider } = radarEls();
  toggle?.addEventListener('click', () => {
    const on = !toggle.classList.contains('on');
    setRadarControlsEnabled(on);
    mapMod.setRadarEnabled(on);
    if (on) showFrame(state.radar.idx);
    else stopRadarLoop();
  });
  play?.addEventListener('click', toggleRadarPlay);
  slider?.addEventListener('input', () => {
    stopRadarLoop();
    showFrame(Number(slider.value));
  });
}

// ---------- loading ----------

async function loadSnow() {
  ui.setStatus('Loading SNOTEL stations…');
  const meta = await api.fetchStationMeta();
  ui.setStatus(`Loading snow data for ${SNOTEL_STATES.length} states…`);
  state.stations = [];
  let landed = 0;
  const { failedStates } = await api.fetchAllSnow(meta, (st, stations) => {
    state.stations.push(...stations);
    landed += 1;
    ui.setStatus(`Snow data: ${landed}/${SNOTEL_STATES.length} states loaded…`);
    redrawStations();
    redrawKPIs();
  });
  if (failedStates.length) {
    ui.setStatus(`Loaded with errors — no data for ${failedStates.join(', ')}`, true);
  }
  // Late season most medians are ~0, so "% of normal" paints everything gray.
  // Default to the SWE view then, unless the user already picked a mode.
  const withNormal = state.stations.filter((s) => s.pctMedian != null).length;
  if (!state.userSetColorMode && state.colorMode === 'pct' && withNormal < 100) {
    state.colorMode = 'swe';
    document.querySelectorAll('#color-mode .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === 'swe');
    });
    redrawStations();
  }
}

async function loadAlerts() {
  ui.setStatus('Loading NWS alerts…');
  const { alerts, features } = await api.fetchAlerts();
  state.alerts = alerts;
  state.alertFeatures = features;
  redrawAlerts();
  redrawKPIs();
}

async function loadRadar() {
  const data = await api.fetchRadarFrames();
  mapMod.setRadarData(data);
  state.radar.frames = data.frames.length;
  state.radar.idx = Math.max(0, data.frames.length - 1);
  const { slider } = radarEls();
  if (slider) slider.max = String(Math.max(0, data.frames.length - 1));
  mapMod.setRadarEnabled(true);
  setRadarControlsEnabled(true);
  showFrame(state.radar.idx);
}

async function refreshAll() {
  ui.setLoading(true);
  const jobs = [loadSnow(), loadAlerts(), loadRadar()];
  const results = await Promise.allSettled(jobs);
  ui.setLoading(false);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    ui.setStatus(`Some data failed to load: ${failed.map((f) => f.reason?.message).join(' · ')}`, true);
  } else if (!document.querySelector('#status-bar.error')) {
    ui.setStatus('');
  }
  ui.setLastUpdated(new Date());
}

// ---------- boot ----------

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('snowfield-theme', theme); } catch { /* private mode */ }
  mapMod.setBasemap(theme);
  redrawStations();
  if (state.selectedStation) {
    const history = state.historyCache.get(state.selectedStation.triplet) || [];
    ui.showStationPanel(state.selectedStation, history, THEMES[theme]);
    mapMod.highlightStation(state.selectedStation.triplet, theme);
  }
}

function init() {
  mapMod.initMap();
  mapMod.setBasemap(state.theme);
  mapMod.renderLegend(state.colorMode, state.theme);
  ui.initUI({
    onRefresh: refreshAll,
    onThemeToggle: () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'),
    onColorMode: (mode) => { state.userSetColorMode = true; state.colorMode = mode; redrawStations(); },
    onStateFilter: (st) => { state.stateFilter = st; redrawStations(); },
    onCategoryToggle: (cat, enabled) => {
      if (enabled) state.activeCategories.add(cat);
      else state.activeCategories.delete(cat);
      redrawAlerts();
    },
    onStationSelect: selectStation,
    onAlertSelect: selectAlert,
    onBack: () => {
      state.selectedStation = null;
      mapMod.highlightStation(null, state.theme);
    },
  });
  ui.setStateOptions(SNOTEL_STATES);
  initRadarBar();
  document.getElementById('legend-toggle')?.addEventListener('click', () => document.body.classList.toggle('legend-open'));
  setRadarControlsEnabled(false);
  refreshAll();
}

init();
