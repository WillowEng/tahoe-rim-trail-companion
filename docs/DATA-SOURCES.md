# v1 data provenance — reviewed 2026-10-19

This prototype contains real geographic observations. It does **not** contain a fabricated TRT loop or invented elevations. The first navigation milestone is **not complete**: its accessible source has a missing connection, and its elevation/topographic resolution needs improvement and field validation.

## Route geometry

- Dataset: OpenStreetMap relation [3094865](https://www.openstreetmap.org/relation/3094865), version 116, relation edit 2022-08-28T16:50:38Z; Overpass snapshot **2022-08-29T04:17:38Z**.
- Retained source: [superr0ute/traildb TRT.json at commit 1e964aef381863869c774ae55fa013b661c84927](https://github.com/superr0ute/traildb/blob/1e964aef381863869c774ae55fa013b661c84927/data/trails/TRT.json). First downloaded from master, then checked against this pinned revision.
- Original acquisition: traildb `src/trail.ts` uses Overpass relation members and `out meta geom`. Retained file: `data/source/TRT.json`.
- License: © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), [OSM copyright](https://www.openstreetmap.org/copyright). The derived `data/route-v1.json` and `data/waypoints-v1.json` remain ODbL; a repository software license does not replace this license.
- Conversion: stitch 141 member ways only at identical source endpoint node IDs and identical coordinates; preserve all 13,150 resulting vertices, rotate to the source vertex nearest the sourced Tahoe City town point, orient clockwise by signed area. Geometry is not rescaled to an advertised mileage.
- **Known gap:** source ways 415120691 and 295046482 terminate at nodes 2387004645 and 2987184218 near Ward Creek, coordinates `(39.1411365, -120.1887749)` and `(39.1396162, -120.1868876)`. The endpoints are about 235 m apart in a straight line. That number is **not trail distance**. No connecting path is known from this snapshot. No line is drawn across it. Selections touching its interior withhold complete distance, ascent and descent. Internal station indexing uses the endpoint chord solely to order positions; it is excluded from measured trail length. Incomplete profiles use percentage traversal axes, not mileage.
- Limitations: historical data, no current reroutes/closures or official TRTA certification. Two-point section distances are cumulative WGS84-sphere haversine lengths of the actual sourced geometry, not straight-line endpoint distances. Geometric distance is not a surveyed field measurement. Point snapping uses a local planar projection followed by haversine offset checking.

## Elevation and topographic maps

- Retained route samples: the `z` values in that same source, in meters. traildb populated them with [`z-factory` AWSTileSource](https://github.com/superr0ute/traildb/blob/1e964aef381863869c774ae55fa013b661c84927/src/zfactory.ts) and zoom 11 (see `src/trail.ts`).
- Raster terrain: 13 **Mapzen / Tilezen Terrarium** DEM tiles from the repository's pinned `data/elev/11/{x}/{y}.png` cache, retained under `data/source/dem/`. These are elevation encodings, not public OSM basemap tiles. Decode: R*256 + G + B/256 - 32768 meters.
- Tile IDs: 339/781, 339/782, 340/780, 340/781, 340/782, 340/783, 341/780, 341/781, 341/782, 341/783, 341/784, 342/781, 342/783. These cover the sourced trail vertices; they do not cover the entire rectangular Tahoe region. Source sampling is approximately 60 m/pixel at Tahoe. PNG rendering at 512 pixels does not add detail.
- App maps: locally generated hillshade, muted elevation tint and **100 m contours**, with every other contour labelled in meters. They show **terrain overview** only: no roads, shorelines, hazards, land ownership or adjacent trails. Missing tiles remain blank. No external tile server is contacted by the app.
- Upstream reference: [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), [Tilezen sources](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md), [Tilezen attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). The latter is retained as `docs/terrain-attribution.md`.
- Licenses: US terrain sources include USGS 3DEP/NED, SRTM and GMTED (public-domain US government data). Mapzen distributes the open terrain product for reuse; retain Mapzen/Tilezen and upstream-provider attribution. **The mirror does not retain per-tile source headers, acquisition dates, or tile generation dates.** Do not assert a precise USGS edition or a single exclusive source. Full upstream attribution is retained because precise component lineage cannot be recovered here.
- Calculations: a route-anchored 30 m horizontal sampling grid, with exact selection endpoints (so reversing uses identical samples), and a triangular 120 m-wide elevation smoothing window sampled at offsets -60, -30, 0, 30, 60 m, weighted 1, 2, 3, 2, 1. Samples never smooth across the gap. Positive/negative changes in the smoothed profile produce gain/loss estimates. Min/max refer to the smoothed sampled profile. Grade = 100 * signed elevation change / horizontal distance; colors use absolute grade at thresholds <=5, <=10, <=15, >15 percent. Uphill and downhill use the same colors.
- Limitations: this resolution cannot resolve small switchbacks or reliable short-distance steepness; smoothing attenuates extremes. Elevations are model-derived estimates, not barometric measurements. These limitations prevent claiming survey-accurate profiles.

## Waypoints

- Dataset: [traildb `dist/poi/TRT.json`](https://github.com/superr0ute/traildb/blob/1e964aef381863869c774ae55fa013b661c84927/dist/poi/TRT.json); 121 OSM features, repository POI version **2022-08-27**. Original feature edit timestamps are retained individually; not every point was observed on that date.
- Categories: water, camping/shelter, towns, landmarks. Names, coordinates, tags, IDs and edit timestamps come from the source. No invented trailhead locations or campsite permissions.
- License: ODbL 1.0 / © OpenStreetMap contributors. The mirror's MIT license is retained in `data/source/LICENSE-traildb.txt`; it covers the repository's own work, not replacement licensing of OSM or terrain inputs.
- Each point is displayed at its actual sourced coordinate. Endpoint selection snaps to its nearest sourced route location. The UI reports off-trail distance. The along-section list is ordered by that snapped station; it does not include an off-trail access route. A nearby town is not itself on the hiking route. Water, camping legality, access and trailhead coverage remain unverified; the snapshot does not provide a verified trailhead layer.

## Official source investigated

The user-provided [TRTA maps page](https://tahoerimtrail.org/maps-trail-info/) was reviewed on 2026-10-19 via web browsing. It links official segment maps, an ArcGIS public map and centerline downloads (large/small GPX, KMZ, shapefile). The executor's network policy blocked `tahoerimtrail.org`; no official geometry was downloaded or redistributed. Public availability alone does not establish redistribution permission. The app links TRTA for current information, and **does not label this snapshot official**.

To finish the milestone, obtain a current, complete, redistribution-permitted route and a documented higher-resolution DEM, validate topology/elevation against official resources, and regenerate versioned assets and tests. Do not patch the Ward Creek gap with guessed coordinates.

## Local verification

`offline-manifest-v1.json` is generated at build time and lists every runtime resource's URL, byte count, and SHA-256. Download verifies all fetched files, writes the pack, then rereads and hashes every stored file. Check Local Files repeats this from Cache Storage without relying on an old status flag. This verifies bytes, not geographic accuracy or iPhone storage persistence. Safari can evict data. Verify and conduct an Airplane Mode relaunch before each trip.
