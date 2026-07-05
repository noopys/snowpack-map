// ui.js — sidebar/panel DOM logic for the Snowfield dashboard.
// Renders KPIs, station list, alert chips/list, the station detail panel, and
// an inline (library-free) SWE sparkline. Consumes shapes produced by api.js;
// never fetches. All DOM lookups are guarded so a missing node never throws.

import { ALERT_CATEGORIES, SEVERITY_COLORS, pctColor, sweColor } from './config.js';

/** Handlers registered by initUI; render-time click callbacks read from here. */
let _handlers = {};

/* ------------------------------------------------------------------ helpers */

const $ = (sel) => document.querySelector(sel);

/** number → "1,234" thousands-separated, or "–" when null/NaN. */
function fmtCount(n) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  return Number(n).toLocaleString('en-US');
}

/** inches with one decimal → "12.4 in", or "–" when null. */
function fmtInches(n) {
  if (n == null) return '–';
  return Number(n).toFixed(1) + ' in';
}

/** whole inches (snow depth) → "40 in", or "–" when null. */
function fmtDepth(n) {
  if (n == null) return '–';
  return Math.round(Number(n)).toLocaleString('en-US') + ' in';
}

/** elevation → "11,212 ft", or "–" when null. */
function fmtElev(n) {
  if (n == null) return '–';
  return Number(n).toLocaleString('en-US') + ' ft';
}

/** percent → "87%", or "–" when null. */
function fmtPct(n) {
  if (n == null) return '–';
  return Math.round(Number(n)) + '%';
}

/** Date | ISO → "3:42 PM" (empty on invalid). */
function shortTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** ISO instant → "3:42 PM" today, else "Tue 3:42 PM" (empty on invalid). */
function shortWhen(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dt.toDateString() === new Date().toDateString()) return time;
  return dt.toLocaleDateString([], { weekday: 'short' }) + ' ' + time;
}

/** 'YYYY-MM-DD' → "Mar 5" (local, no TZ drift). */
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Truncate to max chars with an ellipsis. */
function truncate(s, max) {
  s = String(s || '');
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

/** Close the mobile drawer if we are at a narrow width. */
function maybeCloseDrawer() {
  if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) {
    document.body?.classList.remove('drawer-open');
  }
}

/** Reflect the current html[data-theme] as the ☀/☾ glyph on #btn-theme. */
function updateThemeGlyph() {
  const btn = $('#btn-theme');
  if (!btn) return;
  btn.textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀';
}

/** Set a stat tile's value (and label when given). */
function setStat(id, value, label) {
  const tile = $(id);
  if (!tile) return;
  const v = tile.querySelector('.stat-value');
  const l = tile.querySelector('.stat-label');
  const s = tile.querySelector('.stat-sub');
  if (v) v.textContent = value;
  if (l && label != null) l.textContent = label;
  return { v, l, s };
}

/** Set a KPI tile's value and sub-line. */
function setKpi(id, value, sub) {
  const tile = $(id);
  if (!tile) return;
  const v = tile.querySelector('.stat-value');
  const s = tile.querySelector('.stat-sub');
  if (v) v.textContent = value;
  if (s && sub != null) s.textContent = sub;
}

/** "CO · 11,212 ft · 713:CO:SNTL" */
function stationMeta(st) {
  if (!st) return '';
  const parts = [];
  if (st.state) parts.push(st.state);
  if (st.elevFt != null) parts.push(fmtElev(st.elevFt));
  if (st.triplet) parts.push(st.triplet);
  return parts.join(' · ');
}

/** Alert secondary line: "Boulder County · until Tue 3 PM · zone alert — no outline" */
function alertSubline(a) {
  const timing = a.ends ? 'until ' + shortWhen(a.ends) : 'ongoing';
  const zone = a.hasGeometry ? '' : ' · zone alert — no outline';
  return `${truncate(a.areaDesc, 48)} · ${timing}${zone}`;
}

/* -------------------------------------------------------------------- init */

/**
 * Wire header + sidebar controls to caller handlers.
 * @param {{ onRefresh?:Function, onThemeToggle?:Function, onColorMode?:Function,
 *   onStateFilter?:Function, onCategoryToggle?:Function, onStationSelect?:Function,
 *   onAlertSelect?:Function, onBack?:Function }} handlers
 */
export function initUI(handlers = {}) {
  _handlers = handlers || {};

  $('#btn-refresh')?.addEventListener('click', () => _handlers.onRefresh?.());

  $('#btn-theme')?.addEventListener('click', () => {
    _handlers.onThemeToggle?.();      // handler flips html[data-theme]
    updateThemeGlyph();               // we sync the glyph to the new state
  });

  $('#btn-menu')?.addEventListener('click', () => {
    document.body?.classList.toggle('drawer-open');
  });

  $('#drawer-backdrop')?.addEventListener('click', () => {
    document.body?.classList.remove('drawer-open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body?.classList.remove('drawer-open');
      document.body?.classList.remove('legend-open');
    }
  });

  document.querySelectorAll('#color-mode .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-mode .seg-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      _handlers.onColorMode?.(btn.dataset.mode);
    });
  });

  $('#state-filter')?.addEventListener('change', (e) => {
    _handlers.onStateFilter?.(e.target.value);
  });

  $('#btn-back')?.addEventListener('click', () => {
    _handlers.onBack?.();
    hideStationPanel();
  });

  updateThemeGlyph();
}

/* ----------------------------------------------------------- status / meta */

/** Toggle the global loading state (spinner visibility keys off body.loading). */
export function setLoading(on) {
  document.body?.classList.toggle('loading', !!on);
}

/** Set the status-bar text, optionally in the error style. */
export function setStatus(text, isError) {
  const el = $('#status-text');
  if (el) el.textContent = text ?? '';
  $('#status-bar')?.classList.toggle('error', !!isError);
}

/** Set the header "Updated 3:42 PM" stamp. */
export function setLastUpdated(dateObj) {
  const el = $('#last-updated');
  if (!el) return;
  el.textContent = dateObj ? `Updated ${shortTime(dateObj)}` : '';
}

/* ---------------------------------------------------------------- overview */

/**
 * Fill the 2×2 KPI grid.
 * @param {{ stationsReporting?:number, stationsTotal?:number, pctOfNormal?:number,
 *   pctCount?:number, winterAlerts?:number, totalAlerts?:number }} kpis
 */
export function renderKPIs(kpis = {}) {
  const k = kpis || {};
  setKpi('#kpi-stations', fmtCount(k.stationsReporting), `of ${fmtCount(k.stationsTotal)} total`);
  if (k.pctOfNormal == null) {
    setKpi('#kpi-normal', '–', 'insufficient normals');
  } else {
    setKpi('#kpi-normal', fmtPct(k.pctOfNormal), `of 30-yr median · ${fmtCount(k.pctCount)} stations`);
  }
  setKpi('#kpi-winter', fmtCount(k.winterAlerts), 'warnings & advisories');
  setKpi('#kpi-alerts', fmtCount(k.totalAlerts), 'all active US alerts');
}

/**
 * Populate #state-filter with state codes, keeping the leading "All states"
 * option and the current selection when still valid.
 * @param {string[]} states
 */
export function setStateOptions(states = []) {
  const sel = $('#state-filter');
  if (!sel) return;
  const current = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  (states || []).forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
  sel.value = current;
}

/**
 * Render up to 10 pre-sorted station rows into #top-stations.
 * @param {object[]} stations  caller-sorted (swe desc)
 * @param {object} theme       THEMES token object for the active theme
 * @param {'pct'|'swe'} colorMode  drives the .val-dot color ramp
 */
export function renderTopStations(stations, theme, colorMode) {
  const ol = $('#top-stations');
  if (!ol) return;
  ol.textContent = '';

  (stations || []).slice(0, 10).forEach((st, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-row';

    const rank = document.createElement('span');
    rank.className = 'station-rank';
    rank.textContent = String(i + 1);

    const nameWrap = document.createElement('span');
    nameWrap.className = 'station-info';
    const name = document.createElement('span');
    name.className = 'station-line1';
    name.textContent = st.name;                       // API-derived → textContent
    const sub = document.createElement('span');
    sub.className = 'station-line2';
    sub.textContent = `${st.state} · ${fmtElev(st.elevFt)}`;
    nameWrap.append(name, sub);

    const valWrap = document.createElement('span');
    valWrap.className = 'station-value';
    const dot = document.createElement('span');
    dot.className = 'val-dot';
    dot.style.background = colorMode === 'pct'
      ? pctColor(st.pctMedian, theme)
      : sweColor(st.swe, theme);
    const val = document.createElement('span');
    val.className = 'st-val-num';
    val.textContent = fmtInches(st.swe);
    valWrap.append(dot, val);

    btn.append(rank, nameWrap, valWrap);
    btn.addEventListener('click', () => {
      ol.querySelectorAll('.station-row.selected').forEach((r) => r.classList.remove('selected'));
      btn.classList.add('selected');
      _handlers.onStationSelect?.(st.triplet);
      maybeCloseDrawer();
    });

    li.appendChild(btn);
    ol.appendChild(li);
  });
}

/**
 * Render alert category toggle chips (one per ALERT_CATEGORIES entry).
 * @param {Map<string,number>} counts  catId → alert count
 * @param {Set<string>} activeSet      currently-enabled category ids
 */
export function renderAlertChips(counts, activeSet) {
  const wrap = $('#alert-chips');
  if (!wrap) return;
  wrap.textContent = '';
  const active = activeSet || new Set();

  ALERT_CATEGORIES.forEach((cat) => {
    const n = counts && typeof counts.get === 'function' ? (counts.get(cat.id) || 0) : 0;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    if (active.has(cat.id)) chip.classList.add('on');
    if (n === 0) chip.classList.add('dim');

    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    icon.textContent = cat.icon;
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = cat.label;
    const badge = document.createElement('span');
    badge.className = 'chip-count';
    badge.textContent = String(n);
    chip.append(icon, label, badge);

    chip.addEventListener('click', () => {
      const nowEnabled = !chip.classList.contains('on');
      chip.classList.toggle('on', nowEnabled);
      _handlers.onCategoryToggle?.(cat.id, nowEnabled);
    });
    wrap.appendChild(chip);
  });
}

/**
 * Render the alert list (pre-filtered + sorted by caller) and toggle the
 * empty-state node.
 * @param {object[]} alerts
 */
export function renderAlertList(alerts) {
  const items = alerts || [];
  const empty = $('#alert-empty');
  if (empty) empty.hidden = items.length > 0;

  const list = $('#alert-list');
  if (!list) return;
  list.textContent = '';

  items.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alert-row';
    btn.style.borderLeft = `3px solid ${SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.Unknown}`;

    const event = document.createElement('span');
    event.className = 'alert-event';
    event.textContent = a.event;                      // API-derived → textContent
    const sub = document.createElement('span');
    sub.className = 'alert-sub';
    sub.textContent = alertSubline(a);
    btn.append(event, sub);

    btn.addEventListener('click', () => {
      list.querySelectorAll('.alert-row.selected').forEach((r) => r.classList.remove('selected'));
      btn.classList.add('selected');
      _handlers.onAlertSelect?.(a.id);
      maybeCloseDrawer();
    });
    list.appendChild(btn);
  });
}

/* ------------------------------------------------------------ station panel */

/**
 * Swap to the station detail view, fill stats, draw the sparkline, set the note.
 * @param {object} station
 * @param {object[]} history  HistoryPoint[] for the sparkline
 * @param {object} theme      active THEMES token object
 */
export function showStationPanel(station, history, theme) {
  const overview = $('#view-overview');
  const panel = $('#view-station');
  if (overview) overview.hidden = true;
  if (panel) panel.hidden = false;

  const nameEl = $('#station-name');
  if (nameEl) nameEl.textContent = station?.name ?? '';   // API-derived → textContent
  const metaEl = $('#station-meta');
  if (metaEl) metaEl.textContent = stationMeta(station);

  setStat('#st-swe', fmtInches(station?.swe), 'SWE');
  setStat('#st-depth', fmtDepth(station?.depth), 'Snow depth');
  setStat('#st-pct', fmtPct(station?.pctMedian), '% of median');

  const spark = $('#sparkline');
  if (spark) drawSparkline(spark, history, theme);

  const note = $('#station-note');
  if (note) {
    if (station?.median == null) note.textContent = 'No 30-yr median available for this date.';
    else if (station?.swe === 0) note.textContent = 'Melted out for the season.';
    else note.textContent = '';
  }
}

/** Return to the overview view. */
export function hideStationPanel() {
  const panel = $('#view-station');
  const overview = $('#view-overview');
  if (panel) panel.hidden = true;
  if (overview) overview.hidden = false;
}

/* --------------------------------------------------------------- sparkline */

/** Build an "M x y L x y …" path from a values array, breaking on nulls. */
function pathFrom(vals, xFor, yFor) {
  let d = '';
  let pen = false;
  vals.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += (pen ? 'L' : 'M') + xFor(i).toFixed(1) + ' ' + yFor(v).toFixed(1) + ' ';
    pen = true;
  });
  return d.trim();
}

/**
 * Draw the SWE sparkline (median dashed, this-year solid + area fill) with a
 * pointer crosshair + tooltip. All markup here is numeric/static; tooltip text
 * (API-derived dates/values) is set via textContent.
 */
function drawSparkline(container, history, theme) {
  const data = Array.isArray(history) ? history : [];
  const n = data.length;
  const W = 300, H = 110, padL = 34, padR = 8, padT = 10, padB = 16;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const y0 = padT + plotH;                         // baseline (value 0)

  const swes = data.map((d) => (d.swe == null ? null : d.swe));
  const meds = data.map((d) => (d.median == null ? null : d.median));
  const melted = swes.every((v) => v == null || v === 0);
  const pos = [...swes, ...meds].filter((v) => v != null && v > 0);
  const domainMax = pos.length ? Math.max(...pos) : 1;

  const xFor = (i) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const yFor = (v) => y0 - (Math.max(0, v) / domainMax) * plotH;

  const medPath = pathFrom(meds, xFor, yFor);
  const swePath = pathFrom(swes, xFor, yFor);

  // area fill: swe line closed down to the baseline (first→last present sample)
  let first = -1, last = -1;
  swes.forEach((v, i) => { if (v != null) { if (first < 0) first = i; last = i; } });
  const areaPath = first >= 0
    ? `${swePath} L${xFor(last).toFixed(1)} ${y0} L${xFor(first).toFixed(1)} ${y0} Z`
    : '';

  const p = [];
  p.push(`<svg class="spark-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" role="img" aria-label="Snow water equivalent, last 120 days">`);
  p.push(`<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" style="stroke:var(--baseline)" stroke-width="1"/>`);
  p.push(`<text x="2" y="${padT + 4}" style="fill:var(--muted)" font-size="10">${fmtInches(domainMax)}</text>`);
  p.push(`<text x="2" y="${y0 + 3}" style="fill:var(--muted)" font-size="10">${fmtInches(0)}</text>`);
  if (medPath) p.push(`<path d="${medPath}" fill="none" style="stroke:var(--muted)" stroke-width="2" stroke-dasharray="4 3" opacity="0.6"/>`);
  if (!melted && areaPath) p.push(`<path d="${areaPath}" style="fill:var(--accent)" opacity="0.12"/>`);
  if (!melted && swePath) p.push(`<path d="${swePath}" fill="none" style="stroke:var(--accent)" stroke-width="2"/>`);
  p.push(`<line class="spark-cross" x1="0" y1="${padT}" x2="0" y2="${y0}" style="stroke:var(--muted)" stroke-width="1" opacity="0" pointer-events="none"/>`);
  p.push(`<rect class="spark-hit" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent"/>`);
  if (melted) p.push(`<text x="${(padL + W - padR) / 2}" y="${padT + plotH / 2}" text-anchor="middle" style="fill:var(--muted)" font-size="11">Melted out — no snow on record in this window</text>`);
  p.push('</svg>');

  container.innerHTML = p.join('');

  const tip = document.createElement('div');
  tip.className = 'spark-tip';
  tip.hidden = true;
  container.appendChild(tip);

  const svg = container.querySelector('svg');
  const cross = container.querySelector('.spark-cross');
  if (!svg || melted || n === 0) return;

  const onMove = (e) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((svgX - padL) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    const d = data[idx];
    const cx = xFor(idx);

    cross.setAttribute('x1', cx.toFixed(1));
    cross.setAttribute('x2', cx.toFixed(1));
    cross.setAttribute('opacity', '1');

    tip.textContent = '';
    const rows = [
      fmtDate(d.date),
      'SWE ' + fmtInches(d.swe),
      'Median ' + fmtInches(d.median),
    ];
    rows.forEach((text, i) => {
      const line = document.createElement('div');
      if (i === 0) line.className = 'spark-tip-date';
      line.textContent = text;
      tip.appendChild(line);
    });
    tip.hidden = false;
    tip.style.left = ((cx / W) * rect.width).toFixed(1) + 'px';
    tip.style.top = padT + 'px';
  };

  const onLeave = () => {
    cross.setAttribute('opacity', '0');
    tip.hidden = true;
  };

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);
}
