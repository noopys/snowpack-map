// Data layer: NRCS AWDB (SNOTEL), NWS alerts, RainViewer radar.
// All three APIs are CORS-open; no keys required.

import { API, ALERT_CATEGORIES, SNOTEL_STATES, HISTORY_DAYS, MIN_MEDIAN_IN } from './config.js';

const NWS_HEADERS = { Accept: 'application/geo+json' };

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function getJSON(url, headers) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url.split('?')[0]}`);
  return res.json();
}

/** All active SNOTEL station metadata, keyed by triplet. */
export async function fetchStationMeta() {
  const url = `${API.awdb}/stations?stationTriplets=*:*:SNTL&activeOnly=true`;
  const list = await getJSON(url);
  const byTriplet = new Map();
  for (const s of list) {
    if (s.networkCode !== 'SNTL' || s.latitude == null) continue;
    byTriplet.set(s.stationTriplet, {
      triplet: s.stationTriplet,
      name: s.name,
      state: s.stateCode,
      lat: s.latitude,
      lon: s.longitude,
      elevFt: s.elevation != null ? Math.round(s.elevation) : null,
    });
  }
  return byTriplet;
}

function latestValue(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].value != null) return values[i];
  }
  return null;
}

/**
 * Latest SWE/depth (+ median SWE) for every SNOTEL station in one state.
 * The AWDB endpoint is slow for the nationwide wildcard (~30s), so callers
 * fan out one request per state and render progressively.
 */
export async function fetchStateSnow(stateCode, meta) {
  const url = `${API.awdb}/data?stationTriplets=*:${stateCode}:SNTL` +
    `&elements=WTEQ,SNWD&duration=DAILY` +
    `&beginDate=${fmtDate(daysAgo(4))}&endDate=${fmtDate(new Date())}` +
    `&centralTendencyType=MEDIAN`;
  const rows = await getJSON(url);
  const stations = [];
  for (const row of rows) {
    const base = meta.get(row.stationTriplet);
    if (!base) continue;
    const st = { ...base, swe: null, depth: null, median: null, pctMedian: null, date: null };
    for (const el of row.data || []) {
      const latest = latestValue(el.values || []);
      if (!latest) continue;
      if (el.stationElement.elementCode === 'WTEQ') {
        st.swe = latest.value;
        st.date = latest.date;
        if (latest.median != null) st.median = latest.median;
      } else if (el.stationElement.elementCode === 'SNWD') {
        st.depth = latest.value;
      }
    }
    if (st.median != null && st.median >= MIN_MEDIAN_IN && st.swe != null) {
      st.pctMedian = Math.round((st.swe / st.median) * 100);
    }
    if (st.swe != null || st.depth != null) stations.push(st);
  }
  return stations;
}

/**
 * Fan out per-state snow requests; invokes onState(stations) as each state
 * lands so the map fills in progressively. Resolves with all stations.
 */
export async function fetchAllSnow(meta, onState) {
  const results = await Promise.allSettled(
    SNOTEL_STATES.map(async (st) => {
      const stations = await fetchStateSnow(st, meta);
      onState?.(st, stations);
      return stations;
    }),
  );
  const all = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else failed.push(SNOTEL_STATES[i]);
  });
  return { stations: all, failedStates: failed };
}

/** Daily SWE + median history for one station (sparkline). */
export async function fetchStationHistory(triplet) {
  const url = `${API.awdb}/data?stationTriplets=${encodeURIComponent(triplet)}` +
    `&elements=WTEQ&duration=DAILY` +
    `&beginDate=${fmtDate(daysAgo(HISTORY_DAYS))}&endDate=${fmtDate(new Date())}` +
    `&centralTendencyType=MEDIAN`;
  const rows = await getJSON(url);
  const el = rows?.[0]?.data?.find((d) => d.stationElement.elementCode === 'WTEQ');
  return (el?.values || []).map((v) => ({ date: v.date, swe: v.value ?? null, median: v.median ?? null }));
}

export function categorizeEvent(event) {
  const e = (event || '').toLowerCase();
  for (const cat of ALERT_CATEGORIES) {
    if (cat.match.some((kw) => e.includes(kw))) return cat.id;
  }
  return 'other';
}

/** Active NWS alerts → { alerts, features } (features only where geometry exists). */
export async function fetchAlerts() {
  const gj = await getJSON(API.nwsAlerts, NWS_HEADERS);
  const alerts = [];
  const features = [];
  for (const f of gj.features || []) {
    const p = f.properties || {};
    const alert = {
      id: p.id || f.id,
      event: p.event || 'Unknown event',
      severity: p.severity || 'Unknown',
      category: categorizeEvent(p.event),
      headline: p.headline || '',
      areaDesc: p.areaDesc || '',
      onset: p.onset || p.effective || null,
      ends: p.ends || p.expires || null,
      hasGeometry: !!f.geometry,
    };
    alerts.push(alert);
    if (f.geometry) features.push({ type: 'Feature', geometry: f.geometry, properties: alert });
  }
  return { alerts, features };
}

/** RainViewer radar frames (past + nowcast), oldest first. */
export async function fetchRadarFrames() {
  const j = await getJSON(API.rainviewer);
  const frames = [
    ...(j.radar?.past || []).map((f) => ({ ...f, nowcast: false })),
    ...(j.radar?.nowcast || []).map((f) => ({ ...f, nowcast: true })),
  ];
  return { host: j.host, frames: frames.slice(-16) };
}
