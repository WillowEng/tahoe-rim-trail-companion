# Version 2 · Stage A mapping report

Reviewed 2026-10-20 (America/Los_Angeles). Continues `feat/navigation-prototype-v1` and draft PR #1 from `6540a43`. No merge into `main`; Stages B and C are not implemented.

## Functional features

- A larger map area: compact header/navigation, collapsible desktop section panel, shorter expandable elevation panel, and a non-modal mobile section sheet. Map-only, elevation-only and split views remain. The map remains usable while controls are open.
- Four selectable styles with independent navigation state: **Topographic** (default), **Terrain**, **Satellite / aerial**, and **Standard**. Style changes preserve center, zoom, endpoints and selected section. The local map layers remain underneath missing online tiles, with an explicit error/fallback message.
- A generated layer manager with independent toggles, symbology, legends, source/coverage details and locally persisted preferences. Existing water/camping/town/landmark filters remain synchronized with the new controls.
- Public management, state-park and wilderness polygon overlays, including holes in the source geometry. Transparent fills and outlines sit above basemap images and below the trail/selection/markers. Popups identify the area, agency, classification, dates, regulations, permit information, limitations and source links. Polygon paths support keyboard activation.
- Separate broad **Desolation permit applicability**, **Spooner designated-camping restriction**, and **LTBMU camping-status-unverified** layers. Unsupported categories are visible but disabled; their absence is explained.
- A v2 (~5.4 MiB) explicit offline pack verifies local app/data/map/overlay files by size and SHA-256, then rereads Cache Storage. The old v1 pack is not erased. A v1 verified state does not claim a verified v2 pack.

Existing route selection, draggable snapped endpoints, both directions, same-section reversal, full-loop/viewport selection, linked elevation profiles and grade colors, one-shot GPS and source-gap safeguards remain. Route geometry, elevation samples, POIs and navigation math are unchanged.

## Sources, dates, and licensing

### Geographic polygons

Five full OSM relation snapshots were downloaded through the OSM API and retained under `data/source/boundaries-v2/`:

| Area | Relation | Relation edit date | App overlays |
| --- | --- | --- | --- |
| Lake Tahoe Basin Management Unit | [972002](https://www.openstreetmap.org/relation/972002) | 2026-09-11 | Federal management footprint; camping unverified |
| Desolation Wilderness | [6196636](https://www.openstreetmap.org/relation/6196636) | 2025-02-04 | Wilderness; broad permit applicability |
| Mount Rose Wilderness | [5988616](https://www.openstreetmap.org/relation/5988616) | 2025-05-03 | Wilderness |
| Granite Chief Wilderness | [6196739](https://www.openstreetmap.org/relation/6196739) | 2026-02-18 | Wilderness |
| Spooner Lake & Backcountry State Park | [6520253](https://www.openstreetmap.org/relation/6520253) | 2026-08-07 | State park; designated-camping restrictions |

Geometry and derived GeoJSON: **© OpenStreetMap contributors, ODbL 1.0**. Software remains MIT. Relation versions, exact download URLs, source attributes, counts, extents, byte sizes and SHA-256 hashes are recorded in [boundary-sources-v2.json](boundary-sources-v2.json). This is community mapping, not official agency-validated cadastral geometry. The LTBMU relation attributes upstream USFS data, but its OSM edit date is not an agency survey date or a guarantee of precise ownership.

`prepare-boundaries.py` polygonizes existing source ways at exact shared coordinates, retains holes and every output vertex from the source, and refuses cut/dangling/invalid rings. It does not snap nearby endpoints, simplify geometry, fill missing areas, create buffers, infer legal land ownership, or generate tent sites. Reproduction requires Python + Shapely 2.x only when regenerating data. Shapely performs conversion/validation, not runtime navigation.

Preferred direct USFS/agency downloads were researched, but actual requests to `apps.fs.usda.gov` were denied by the environment proxy (CONNECT 403). The domain-access request remains pending. Official service references include [USFS administrative forest boundaries](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer), [USFS wilderness](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_Wilderness_02/MapServer), and [TRTA special management areas](https://services7.arcgis.com/NchnBpgTjegMVinZ/arcgis/rest/services/Special_Management_Areas/FeatureServer). No agency download is claimed. Administrative boundaries may include private and other-agency inholdings; they must not be treated as public parcel ownership or blanket camping permission.

### Camping rules

Geometry and regulation evidence are separate. The broad Desolation wilderness footprint is paired with a concise [TRTA permits/regulations](https://tahoerimtrail.org/permits-and-regulations/) summary. Desolation requires day-use and overnight permits; the dedicated 2026 TRT thru-hike quota category is noted without inventing its geographic subzones. Individual quota-zone boundaries, campsite exceptions and trail/water setback polygons are not mapped. Obtain the appropriate permit and current conditions from the managing agency/booking source.

The broad Spooner park footprint is paired with [Nevada State Parks' official Spooner page](https://parks.nv.gov/parks/spooner-lake): camping is confined to designated facilities and dispersed camping is prohibited throughout the park. Because designated facilities are exceptions, the entire park is classified **restricted**, rather than falsely marked as a precise polygon prohibiting every form of camping. Current closures, booking availability and campsite footprints are not inferred. The reviewed date records reading these sources, not field verification or a permanent legal determination.

No National Forest or wilderness polygon is automatically classified as unrestricted camping. Unshaded land is also unverified. A public management footprint is not a verified campsite or suitable tent location.

### Basemaps

| Style | Data/provider | Offline result |
| --- | --- | --- |
| Topographic | Retained Mapzen/Tilezen Terrarium DEM; local 100 m contours/hillshade plus sourced TRT and POIs | Verified locally in v2 pack, **partial corridor only** |
| Terrain | New local relief rendered from the same 13 DEM tiles, without contours | Verified locally in v2 pack, same corridor and ~60 m source resolution |
| Satellite / aerial | [USGS Imagery Only](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer) | **Online only in this app**; not added to Cache Storage, release or offline manifest |
| Standard | [OpenStreetMap Standard](https://www.openstreetmap.org/copyright), via `tile.openstreetmap.org` | **Online only**; normal browser caching only, no bulk or offline download |

USGS imagery has varying acquisition dates and resolution; the service metadata is not a promise of recent imagery at a given point. Credits stay visible. This app does not download imagery for offline reuse or claim region-wide offline satellite coverage. [USGS service/license guidance](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map) applies. Standard tiles follow the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/): HTTPS, browser identification/referrer, provider attribution and normal HTTP caching; no prefetch, tile-pack export, cache-bypassing headers or bulk automated pan/zoom. Automated integration tests mock provider responses rather than fetch provider tiles.

Startup and restoring an online-style preference do not automatically contact providers: the app shows a labelled local Topographic fallback until the user requests the online style. Tile failures also disclose the local fallback. No polling, background refresh, automatic network synchronization or continuous GPS is introduced. The same app-level policy applies whether the device reports online or offline; `navigator.onLine` alone is not treated as proof of connectivity.

Live provider access from the cloud executor is **not verified**: requests to `basemap.nationalmap.gov` and `tile.openstreetmap.org` received proxy CONNECT 403. Style-switching logic and failure handling are tested with mocked tiles. These failures are cloud egress restrictions, not evidence that those providers are unavailable to a user's browser.

## Incomplete datasets and accuracy limits

- OSM boundaries are provided for the five listed areas only. Direct agency GIS validation, PAD-US/BLM ownership parcels, other public lands and comprehensive California/Nevada park coverage remain incomplete.
- No mapped “potential dispersed camping” permission polygons, exact campsite exceptions, precise prohibition/setback polygons or individual Desolation quota zones. Those layers remain unavailable rather than fabricated.
- No Stage B campsite/hut, water-reliability or resupply enrichment. Existing OSM 2022 POIs remain unverified.
- Offline Topographic is a terrain/contour overview with the TRT and POIs, not a complete hiking basemap with neighboring roads/trails, shorelines or all geographic labels. Blank areas lie outside the retained terrain corridor. Rendering relief does not improve the DEM source resolution.
- The runtime 2022 trail retains the Ward Creek source gap and incomplete totals when crossed. The prior official-route audit remains relevant: historical TRTA downloads do not supply a verified current closed replacement; current OSM resolves Ward Creek but has unmatched endpoints near Big Meadow. No invented connector is added. See [route provenance](DATA-SOURCES.md) and [follow-up audit](FOLLOW-UP-2026-10-19.md).
- Browser tests are Chromium, not physical iPhone Safari, field navigation, a current closure check or a legal/cadastral survey.

## Validation and preview

- **23/23 Node tests**: all 18 existing navigation tests plus 5 layer/preference/geometry/provenance tests.
- **22/22 original Chromium integration checks**, including one-shot GPS, endpoint dragging, no external startup requests, offline relaunch and corrupt-cache rejection.
- **32/32 Stage A Chromium checks**: map/style state preservation, local fallback, independent polygons, pane order, source popups, persistence, mobile/desktop layout, linked profiles, missing-GIS handling and verified offline layers/maps. Online provider responses are mocked.
- JavaScript syntax, deterministic boundary regeneration, v2 build/release packaging, source/runtime exclusions and whitespace checks pass.

The existing private HTTPS preview remains [Tahoe Rim Trail Companion](https://tahoe-rim-trail-companion-preview.satinymaple5.chatgpt.site). Publication status is established by the native Sites deployment result and recorded in PR #1; the URL itself is not evidence that a new build has deployed. Desktop localhost forwarding is not assumed. The source stays on the existing branch/PR and the Site retains owner-only access.

## Recommended Stage B work after review

Validate agency boundary data and current regulations before increasing camping claims. Then enrich stable waypoint IDs from official campsite/hut, water and resupply sources, with per-field verification dates, access information and explicit unknowns. Keep those data modules independent from navigation. Itinerary generation remains Stage C and is not included in this release.

**Stop at Stage A for user review.**
