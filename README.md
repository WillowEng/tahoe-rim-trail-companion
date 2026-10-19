# Tahoe Rim Trail Companion · v1

An iPhone-first, installable, battery-conscious static PWA for exploring arbitrary trail sections without an itinerary. Runs in Safari; no native app, App Store, account, API key, build-time dependency download, or continuous tracking.

**Prototype status: the first navigation milestone remains incomplete.** The accessible OSM snapshot is from August 2022 and contains a disconnected stretch near Ward Creek. The app marks the gap, draws no guessed connector, and withholds complete distance/ascent/descent for selections crossing it. Its local terrain is an overview, and DEM profiles are estimates. Do not treat this as a complete or field-validated trail navigation product. See [data sources](docs/DATA-SOURCES.md) and [completion report](docs/COMPLETION-v1.md).

## Run locally

Node.js 24 LTS recommended (no npm install needed):

```sh
npm test
npm run check
npm run build
npm run dev
```

Open **http://localhost:4173/tahoe-rim-trail-companion/**. `PORT=8080 npm run dev` changes the port. The same build also works at `/`. Stop with Ctrl-C. Use `npm run release` after building to create `releases/tahoe-rim-trail-companion-v1.tar.gz`. Future releases must increment the major filename/label (`v2`, `v3`, …), cache names and asset manifests together.

Do not open `index.html` as a `file://` URL: module fetches and service workers require an HTTP origin. Plain localhost is a secure context for development; iPhone requires HTTPS.

## Explore

- The initial selected arc starts near Tahoe City and covers 20 measured miles clockwise.
- Select A/B via **Choose on map**, drag either marker (snaps on drag end), move the endpoint sliders, or choose a sourced waypoint. Tap near the route to highlight its profile position.
- **Clockwise / Counterclockwise** chooses either arc between the same endpoints. **Reverse** swaps endpoints and direction to traverse the same section backward. **Entire trail** explicitly selects a full loop; equal endpoints otherwise mean zero distance.
- **Visible section** selects the longest contiguous run of route vertices inside the viewport, in clockwise order. It does not concatenate disconnected visible pieces. At extreme close zoom with fewer than two visible source vertices, zoom out slightly.
- Use **Map**, **Split view**, and **Elevation**. Tap/click the profile to highlight and pan to its map point. Keyboard arrows, Home, and End also explore the profile. Colored profile lines use absolute grade (green ≤5%, yellow ≤10%, orange ≤15%, red >15%); descent uses the same classification.
- Layer checkboxes control sourced water, camping, town and landmark markers. Popups offer endpoint selection. A point can be off the trail; the actual sourced position is displayed, and all hiking distances end at the snapped trail location, excluding access paths. No verified trailhead layer is available.
- **Locate Me** issues exactly one `getCurrentPosition` call: low-power mode, zero cached-age preference, 12-second timeout. It never starts a watch or polling loop. Last fix, accuracy and timestamp are stored locally and shown without activating location.

## Offline download and installation

1. Load the deployed HTTPS page in Safari. Share → **Add to Home Screen**.
2. Launch the installed app. Open **Offline downloads → Download & verify** while online. Browser and installed-app storage can differ: perform the download in the context you intend to use.
3. The app downloads a ~3 MiB versioned pack and verifies every file's size and SHA-256 against the build manifest. It then rereads and verifies all stored files. Only success sets **Pack verified**. Merely opening the page does not establish a verified pack.
4. Press **Check local files** before each trip. Turn on Airplane Mode, fully close the app, relaunch from the Home Screen and test map, profile, endpoint movement, direction reversal and waypoint popups.
5. Safari can evict storage or clear it with browsing data. Persistence requests are advisory, and a previously verified indicator is not a permanent guarantee.

Offline after successful verification: shell, vendored Leaflet, sourced route/elevations/waypoints, arbitrary section calculations, map/profile interactions, 13 hillshade/contour tiles and provenance text. No remote fonts or tile-server requests. Blank map areas are outside the retained terrain corridor. Offline storage does **not** repair the source gap or increase DEM resolution. A GPS fix may be possible without cellular service but depends on the device and surroundings.

## Deploy through GitHub Pages

`.github/workflows/pages.yml` tests and packages pull requests; pushes to `main` or manual runs on `main` deploy the static `dist/` artifact. In GitHub repository **Settings → Pages → Source**, select **GitHub Actions**. Review/merge this change into `main`, then check the workflow and the returned deployment URL. The expected project URL is `https://willoweng.github.io/tahoe-rim-trail-companion/` (not confirmed deployed by this task).

All assets, module imports, manifest `start_url`/`scope`, offline pack URLs, and service-worker registration resolve relative to the app directory, so repository subpaths and custom domains work. The service worker controls only this app directory. There is no client-side router requiring a 404 redirect. No server-side services or secrets are used.

To preview on an iPhone, use the deployed HTTPS site, or an HTTPS development origin reachable from the phone. `http://<computer-ip>:4173` is insufficient for service-worker installation on Safari. Desktop localhost testing cannot establish real iPhone compatibility.

## Tests and verification

`npm test` runs Node's built-in tests for haversine distance, interpolation, arbitrary endpoints, origin wrapping in both directions, complementary arcs, reversing the same section, full/empty loops, grade thresholds/symmetry, smoothed elevation calculations, explicit gap handling and viewport selection. Real-data checks validate coordinate range, elevations, clockwise orientation, the retained gap and a known contiguous section. No fabricated data is shipped as trail data; synthetic square fixtures exist only in tests.

`npm run check` performs JavaScript syntax checks. `npm run build` produces an offline resource manifest with SHA-256 and byte counts. Optional integration QA (start the development server in another terminal):

```sh
npm install --no-save --package-lock=false playwright@1.57.0
npx playwright install chromium
npm run test:browser
```

Use `CHROMIUM_EXECUTABLE=/path/to/chromium` to use a system browser instead. `PREVIEW_ORIGIN` changes the default localhost URL. The browser checks exercise map/profile modes, sliders, reversal, gap disclosure, layers, marker dragging, one-shot GPS, verified offline relaunch, corrupt-cache detection, subpath/root hosting, and absence of external requests. This optional test dependency is not shipped to hikers.

Recorded evidence is in `docs/COMPLETION-v1.md`.

## Architecture

- `src/navigation.js`: framework-independent geometry, snapping, section, smoothing, grade and elevation calculations; no GPS/network/storage dependencies.
- `src/app.js`: Leaflet/UI interaction, display modes, source disclosure, explicit one-shot location and local preference state.
- `src/offline.js` / `sw.js`: explicit pack download and local hash validation; app-scoped static caching. No background sync or network refresh loops.
- `data/*-v1.json`: runtime route, waypoint and terrain manifests. `data/terrain/`: derived local terrain imagery. `data/source/`: retained upstream snapshots for audit, excluded from the deployed runtime pack.
- `scripts/prepare-data.py`: deterministic offline source conversion and contour/hillshade rendering. Requires Python 3 with NumPy, Pillow and Matplotlib **only when regenerating data**, not to run/build/deploy the app. Run `MPLCONFIGDIR=/tmp/trt-mpl python scripts/prepare-data.py`.
- `scripts/build.mjs`, `serve.mjs`, `release.mjs`: dependency-free static packaging, local preview and versioned tarball.

Future itinerary records should reference route version + endpoint stations + direction in a separate planning module, preserving original plans. Statistics can consume the existing section output. Weather/conditions should have an explicit manual refresh, source timestamp and offline snapshot; they must not change navigation state or add background work.

## Licensing

Application code: MIT, see `LICENSE`. Leaflet 1.9.4: BSD-2-Clause, vendored license retained. OSM route/waypoint data and derivatives: ODbL 1.0, © OpenStreetMap contributors. Mapzen/Tilezen terrain: upstream provider licenses and attribution, including public-domain USGS datasets; exact component metadata is unavailable in the mirror. See `docs/terrain-attribution.md`, `data/source/LICENSE-traildb.txt`, and `docs/DATA-SOURCES.md`. No public OpenStreetMap tile-server imagery is used or downloaded.
