# Snowfield — US Snowpack & Storm Dashboard

A zero-build static web app that maps live SNOTEL snowpack conditions, active NWS weather alerts, and animated precipitation radar across the western United States.

## Features

- Interactive Leaflet map of ~900 SNOTEL stations, colored by **% of 30-year median SWE** (diverging blue–red ramp) or **absolute SWE** (sequential blue), with marker size scaled by SWE
- NWS active-alert polygons colored by severity, with category filter chips (winter, tropical, thunderstorm, flood, wind, fire, heat, marine, other)
- Animated radar overlay with play/pause and a scrubbable timeline
- KPI tiles summarizing current snowpack conditions
- Top-10 deepest snowpack station list
- Per-station detail panel with a 120-day SWE-vs-median sparkline
- Dark and light themes
- Mobile-friendly drawer layout

## Running it

There is no build step. Serve the repo root with any static file server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The app needs internet access at runtime — basemap/radar tiles and all data are fetched client-side from public APIs. No API keys required.

## Data sources

| Source | What it provides | Endpoint host | Key needed |
| --- | --- | --- | --- |
| NRCS AWDB (SNOTEL) | Station metadata (via `stationTriplets=*:*:SNTL` wildcard) and daily WTEQ/SNWD values with 30-yr medians (`centralTendencyType=MEDIAN`), fetched in parallel per state | `wcc.sc.egov.usda.gov` | No |
| NWS Alerts | Active weather alerts as GeoJSON, including polygon geometry and severity | `api.weather.gov` | No |
| RainViewer | Recent radar frames as raster tile layers | `api.rainviewer.com` / `tilecache.rainviewer.com` | No |
| CARTO | Light/dark basemap tiles | `basemaps.cartocdn.com` | No |

Note: the AWDB data endpoint's element parameter is `elements=`, not `elementCds=`.

## Architecture

Plain ES modules loaded directly by the browser — no bundler, no framework, no dependencies beyond Leaflet 1.9.4 pulled from the unpkg CDN. `app.js` orchestrates startup: it fetches data through `api.js`, then hands results to the map and UI layers.

- `index.html` — page shell, layout containers, Leaflet CDN includes
- `css/style.css` — all styling, including theme variables and mobile drawer layout
- `js/config.js` — endpoint URLs, color ramps, thresholds, and tunables
- `js/api.js` — fetch wrappers for AWDB, NWS alerts, and RainViewer
- `js/ui.js` — KPI tiles, top-10 list, detail panel, sparkline, filter chips, theme toggle
- `js/map.js` — Leaflet map, station markers, alert polygons, radar overlay
- `js/app.js` — entry point wiring data, map, and UI together

## Notes & limitations

- Late-season melt-out means many stations legitimately read 0 SWE in summer.
- The %-of-median view is hidden for a station when its 30-year median for the date is below 0.5 in (ratios become meaningless).
- Zone-based NWS alerts carry no geometry, so they appear in the alert list but have no outline on the map.
- Radar tiles are provided courtesy of RainViewer's free tier; frame history and resolution are limited accordingly.
