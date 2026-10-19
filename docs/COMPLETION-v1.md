# v1 implementation report — 2026-10-19

## Outcome

A runnable static, iPhone-first navigation prototype is implemented. **The first navigation milestone is not complete:** the accessible historical route snapshot is disconnected near Ward Creek. The app makes this explicit and withholds whole-section totals whenever that gap is crossed. No invented coordinates, elevations, trailheads, or connecting route are shipped.

## Implemented

- Leaflet 1.9.4 (open-source, vendored locally) displays all 141 sourced TRT ways as a continuous measured chain with an explicitly marked missing connection. Zoom, pan, selected-section fit, local topographic terrain/100 m contours and a clear selected route.
- Arbitrary snapped trail endpoints by map tap, draggable A/B markers, sliders or existing POIs. Both clockwise/counterclockwise arcs, reversal of the same section, entire-route selection and longest contiguous viewport section. No itinerary dependency.
- Cumulative trail-distance calculations over actual sourced geometry, including origin wrap in both directions. A missing connection never contributes to a reported complete trail distance.
- Selected-section smoothed DEM elevation profile, estimated gain/loss and minimum/maximum, with symmetric absolute-grade colors. Linked map/profile exploration by touch/click and keyboard profile control. Full map, full profile and split displays.
- Water/camping/town/landmark filters, actual sourced POI coordinates and information popups; route-snapped endpoint actions and explicitly excluded off-trail access paths. Small overview markers cull collisions; the section list retains all matching POIs.
- Responsive iPhone interface, standalone PWA manifest, safe-area spacing, touch controls and local persisted selection.
- Explicit one-shot location request (low-power, 12-second timeout), last position/accuracy/timestamp; no watch, polling, background location, background sync, auto weather or continuous animations.
- Versioned, checksummed offline download pack with download validation and local reread validation; manual local recheck, honest status and storage-eviction disclosure.
- GitHub Pages subpath-compatible build, CI/tests/deployment workflow, dependency-free development server, v1 release archive script, retained source snapshots and provenance.

## Actual data

[DATA-SOURCES.md](DATA-SOURCES.md) records precise dataset paths, versions, snapshot/edit dates, transformations, attribution, license and missing metadata.

- OpenStreetMap relation 3094865 v116, Overpass snapshot 2022-08-29T04:17:38Z, 141 ways / 13,150 stitched vertices, from the pinned superr0ute/traildb repository. ODbL 1.0.
- Elevation samples in that snapshot from Mapzen/Tilezen Terrarium zoom-11 tiles; 13 cached tiles retained for derived hillshade, elevation tint and contour maps. ~60 m ground pixels; exact underlying acquisition/tile-generation dates and per-tile source headers are unavailable. Upstream attribution document retained.
- 121 OSM POIs from the repository's August 2022 POI export; individual feature edit dates and tags retained. ODbL 1.0.
- Official TRTA mapping resources reviewed and linked, but their data was not downloaded due to the environment's host restriction. No assertion of official geometry, current conditions, complete trailhead coverage or precise source edition.

## Offline scope

After every runtime resource passes SHA-256 and size verification: app, local library, known trail geometry/elevation/waypoints, map/profile interactions, section calculations, 13 terrain tiles and provenance text work offline. The ~3 MiB manifest enumerates actual resources; exact total is reported by the build.

The initial service-worker shell is separate from the explicitly downloaded pack. Opening the site alone does not turn the indicator green. The downloaded pack is reread for verification, and deleting or corrupting any required file fails verification. Offline success is verified at the byte/storage level, not a claim of geographic completeness or iOS retention guarantees.

## Validation

- **18/18 automated navigation tests pass** using Node 24: horizontal great-circle distances, arbitrary/fractional endpoints, origin wrapping both ways, complementary arcs, reverse distance/gain/loss, full versus empty loop, grade boundaries and uphill/downhill symmetry, smoothing, source gap detection/exclusion, trail-relative waypoint distances, viewport selection and the retained real snapshot.
- JavaScript syntax checks pass (`npm run check`).
- Static build creates a byte-count/SHA-256 resource manifest. Runtime dependencies are local and no remote basemap/fonts are requested.
- Automated Chromium QA at **390 × 844**: app initialization without uncaught errors, initial 20.0 mi section, same-distance reversal, entire-loop gap disclosure, all local pack files downloaded and verified, forced browser offline reload and a successful offline local-file recheck. This is desktop Chromium emulation, **not a physical iPhone/Safari result**.
- **21/21 retained browser integration checks pass**, including mode changes, endpoint sliders/dragging, layer visibility, one-shot GPS and persisted position without startup GPS, offline relaunch/re-verification, corrupt-cache rejection, repository subpath and root hosting, and no external requests.

## Remaining work before claiming the milestone complete

1. Replace/repair the historical route using a complete, current and redistribution-permitted dataset. Validate continuity and official route alignment; never guess the Ward Creek connector.
2. Obtain higher-resolution, precisely documented DEM data; verify elevation datum, smoothing, grade accuracy and expected trail elevation range against an independent reference.
3. Verify full offline terrain coverage at useful field-navigation zoom levels. Current local terrain covers source vertices in an overview corridor, with blank areas beyond it and no surrounding trail/road/shoreline context.
4. Add a verified trailhead dataset and verify water/camping access and restrictions. Current OSM POIs cannot establish present availability or legal camping.
5. Physical iPhone/Safari testing and field validation below. No claims of completion until these limits are resolved.

## Preview and deployment

Run `npm test && npm run check && npm run build && npm run dev`. Open `http://localhost:4173/tahoe-rim-trail-companion/` on the development computer. The dev server also serves `/` to check root hosting. `npm run release` produces `releases/tahoe-rim-trail-companion-v1.tar.gz`.

Review the implementation, commit/merge into `main`, select GitHub Actions in repository Settings → Pages, and run the supplied workflow. A Pages deployment has **not** been performed or verified in this task. All paths and service-worker scope support the repository prefix. The expected URL after successful deployment is `https://willoweng.github.io/tahoe-rim-trail-companion/`.

## Physical iPhone checklist

- Current supported iOS/Safari: map pan/pinch/zoom, marker dragging, precise map taps, profile taps, all display modes, endpoint selects/sliders, small/large text, portrait/landscape, safe-area spacing, touch keyboard and VoiceOver focus.
- Share → Add to Home Screen; launch installed app; download in that app's storage context; verify, enable Airplane Mode, force-close and relaunch from Home Screen. Exercise arbitrary sections and both wrap directions, including the explicit source gap.
- Delete one cached file and verify status fails; simulate low storage/eviction; reject location permission; test location timeout, poor accuracy and successful GPS without network. Confirm no geolocation requests occur on startup, resume or ordinary map use.
- Measure multi-hour battery/thermal behavior and memory on an actual device with screen settings controlled. Desktop design/code inspection cannot verify real battery endurance.
- Compare elevations and route geometry with authorized current official maps, then field-check representative sections before navigation use.
