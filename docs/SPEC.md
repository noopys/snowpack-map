# Snowfield — US Snowpack & Storm Dashboard: interface spec

Zero-build static web app (ES modules). Live data: SNOTEL snowpack (NRCS AWDB),
NWS active alerts, RainViewer radar. Leaflet 1.9.4 from unpkg CDN.

Files and owners:

- `index.html` + `css/style.css` — markup + all styling (UI-shell task)
- `js/ui.js` — sidebar/panel DOM logic (UI-logic task)
- `js/config.js` — design tokens, ramps, categories (done — read it, use its exports)
- `js/api.js`, `js/map.js`, `js/app.js` — data + map + orchestration (integrator)

## Layout

Full-viewport app, no page scroll. CSS grid:

```
+----------------------------------------------------------+
| header (52px)                                            |
+----------------+-----------------------------------------+
| sidebar (360px)| #map (fills rest)                       |
| scrollable     |   legend overlay (bottom-left)          |
|                |   radar bar overlay (bottom-center)     |
+----------------+-----------------------------------------+
```

At ≤820px the sidebar becomes a slide-over drawer toggled by `#btn-menu`
(hamburger button in header, hidden on desktop). Body gets class
`drawer-open` when shown.

## Theme

`<html data-theme="dark">` is the default; toggling sets `data-theme="light"`.
ALL colors in CSS come from custom properties defined on `:root[data-theme=dark]`
and `:root[data-theme=light]` using EXACTLY the values in `js/config.js` THEMES
(surface, page, textPrimary→`--text-primary`, textSecondary, muted, grid,
baseline, border, accent). Also respect `prefers-color-scheme` only as the
initial value set by a tiny inline script in `<head>` (already choose dark if
no preference). Font: `system-ui, -apple-system, "Segoe UI", sans-serif`.
Tabular numerals (`font-variant-numeric: tabular-nums`) for stat values, table
rows, and the radar clock.

Aesthetic: calm, weather-ops feel. Page plane behind, cards on surface with
hairline borders (var(--border)), 8px radii, no shadows heavier than
`0 1px 2px rgba(0,0,0,.25)`. Text wears text tokens only — series/status color
appears only as small swatches/dots next to text, never as text color.

## DOM contract (ids/classes are load-bearing — ui.js and map.js query them)

Header (`header#app-header`):
- `#btn-menu` (mobile only), brand block: snowflake glyph ❄ + `<h1>` "Snowfield"
  + subtitle span "US snowpack & storms"
- right cluster: `#last-updated` (muted text), `#btn-refresh` (icon button ⟳ with
  label "Refresh"), `#btn-theme` (icon button, shows ☀/☾)

Sidebar (`aside#sidebar`): two swappable views —

`#view-overview` (default) contains, top to bottom:
1. `#kpi-grid` — 2×2 grid of `.stat-tile`s, ids `#kpi-stations`, `#kpi-normal`,
   `#kpi-winter`, `#kpi-alerts`. Each tile: `.stat-label` (11px uppercase
   letterspaced muted), `.stat-value` (26px semibold), `.stat-sub` (12px
   secondary). Initial values "–".
2. Section `#sec-snow` with `.sec-title` "Snowpack" and:
   - `#color-mode` — segmented control, two `<button class="seg-btn">` with
     `data-mode="pct"` ("% of normal", starts `.active`) and `data-mode="swe"`
     ("Snow depth (SWE)")
   - `#state-filter` — `<select>` with option "All states" (value "") — ui.js
     fills the rest
   - `#top-stations` — `<ol>` of `.station-row` items (ui.js renders): rank,
     name+state/elev on two lines, right-aligned SWE value with small colored
     dot `.val-dot`. Rows are buttons (hover wash, pointer).
3. Section `#sec-alerts` with `.sec-title` "Storm alerts" and:
   - `#alert-chips` — wrapping row of `.chip` toggle buttons (ui.js renders;
     chip = icon + label + count, `.chip.on` = enabled state with accent-tinted
     border/bg)
   - `#alert-list` — list of `.alert-row` buttons (ui.js renders): left 3px
     color bar (severity color via inline style), event name (13px, primary),
     area/timing line (12px secondary, single line ellipsis)
   - `#alert-empty` — hidden empty-state div "No active alerts match filters"
4. `#status-bar` — sticky footer line of sidebar: `.spinner` (CSS spinner,
   hidden unless body has class `loading`) + `#status-text` (12px muted).
   `#status-bar.error #status-text` renders in `#d03b3b`.

`#view-station` (hidden by default via `[hidden]`):
- `#btn-back` ("← All stations" ghost button)
- `#station-name` (h2), `#station-meta` (secondary: e.g. "CO · 11,212 ft ·
  713:CO:SNTL")
- `#station-stats` — 3 `.stat-tile`s: `#st-swe`, `#st-depth`, `#st-pct`
  (same tile anatomy as KPIs)
- `#spark-card` — card with `.sec-title` "Snow water equivalent — last 120 days"
  and `#sparkline` (empty div, ui.js injects an SVG), plus `#spark-legend`:
  two `.legend-item`s — solid 2px accent line swatch "This year", dashed muted
  swatch "Median (30-yr)"
- `#station-note` (12px secondary, e.g. typical peak / melted-out note)

Map pane (`main#map-pane`):
- `<div id="map">`
- `#map-legend` — absolutely positioned bottom-left card (map.js fills content;
  style `.legend-row` = 10px swatch dot + 11px label, plus `.legend-title`)
- `#radar-bar` — bottom-center pill overlay: `#btn-radar-toggle` (toggle
  button, label "Radar", `.on` state), `#btn-radar-play` (▶/⏸),
  `<input type="range" id="radar-slider" min="0" value="0">`, `#radar-time`
  (11px tabular). When radar off, play/slider/time get `disabled`/dimmed.

Attribution: Leaflet default attribution stays on (bottom-right). Style it
small/muted but visible in both themes.

## Data shapes (produced by api.js — ui.js consumes, do not fetch)

```js
Station = { triplet, name, state, lat, lon, elevFt,
            swe, depth, median, pctMedian, date }  // numbers or null
HistoryPoint = { date: 'YYYY-MM-DD', swe, median } // for sparkline
Alert = { id, event, severity, category, headline, areaDesc,
          onset, ends, hasGeometry }               // severity keys SEVERITY_COLORS
KPIs = { stationsReporting, stationsTotal, pctOfNormal, pctCount,
         winterAlerts, totalAlerts }
```

## ui.js exported API (UI-logic task implements exactly this)

```js
export function initUI(handlers)
// wires header/sidebar controls; handlers:
// { onRefresh(), onThemeToggle(), onColorMode(mode), onStateFilter(state),
//   onCategoryToggle(catId, enabled), onStationSelect(triplet),
//   onAlertSelect(id), onBack() }
export function setLoading(on)            // toggles body.loading
export function setStatus(text, isError)  // status bar text
export function setLastUpdated(dateObj)   // "Updated 3:42 PM"
export function renderKPIs(kpis)          // fills 4 tiles; pctOfNormal null → "–" with sub "insufficient normals"
export function setStateOptions(states)   // fills #state-filter
export function renderTopStations(stations, theme, colorMode)
// top-10 by swe desc (pre-sorted by caller); dot color = pctColor/sweColor from config
export function renderAlertChips(counts, activeSet)  // counts: Map catId→n; ALERT_CATEGORIES order; include zero-count chips dimmed
export function renderAlertList(alerts)   // pre-filtered+sorted by caller; severity color bar; "(zone alert — no outline)" suffix when !hasGeometry; click → onAlertSelect(id)
export function showStationPanel(station, history, theme)
// swaps views, fills stats, draws sparkline SVG (see below), sets note
export function hideStationPanel()        // back to overview
```

Sparkline (in ui.js, no libraries): responsive SVG ~ 300×110, two paths —
median as 2px dashed line in var(--muted) at 60% opacity, this-year SWE as 2px
solid var(--accent) with subtle area fill (accent at 12% opacity). Left axis:
just min/max tick labels (10px muted, tabular); baseline hairline at 0. Hover
layer: transparent rect tracking pointermove → vertical hairline + tooltip
(`.spark-tip`, absolutely positioned div) showing date, SWE, median; hide on
pointerleave. If every swe value is 0/null, render the axis + median line and
overlay centered note "Melted out — no snow on record in this window".
Numbers formatted like `12.4 in`.

## Behavior notes (integrator wires these; listed so styles exist)

- Marker hover → Leaflet tooltip (dark/light aware via CSS overrides of
  `.leaflet-tooltip`, `.leaflet-popup-content-wrapper` to surface/border/ink
  tokens).
- `.station-row.selected` + `.alert-row.selected` visible selected state.
- Buttons: `.icon-btn` (header), `.ghost-btn`, `.seg-btn`, `.chip` — all need
  :hover, :focus-visible (2px accent outline), disabled states.
- Scrollbars inside sidebar: thin, themed.
- `#alert-list` and `#top-stations` max-height none — sidebar itself scrolls;
  KPI grid and section titles are not sticky.

## What index.html includes (order matters)

1. `<meta name="viewport" content="width=device-width, initial-scale=1">`,
   `<meta name="color-scheme" content="dark light">`, title "Snowfield — US
   Snowpack & Storm Dashboard", inline SVG favicon (data URI snowflake ok)
2. Leaflet CSS `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`
3. `css/style.css`
4. Tiny inline theme-init script (reads localStorage `snowfield-theme`, else
   `prefers-color-scheme`, sets `data-theme` before paint)
5. Body markup per DOM contract, all lists empty (JS fills)
6. `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`
   then `<script type="module" src="js/app.js"></script>`
