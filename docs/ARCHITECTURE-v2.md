# Version 2 architecture — Stage A only

Navigation remains in `src/navigation.js`, unchanged. Independent endpoint stations, selected arcs and elevation calculations never depend on the visible basemap, geographic overlays, or any itinerary. Existing section/GPS preferences retain their v1 keys because the underlying route is unchanged.

`src/map-layers.js` contains basemap and polygon-layer registries. Each polygon definition has a stable ID, group, symbology, default visibility and coverage note. Dataset features identify the registry layer and supply geographic provenance plus optional regulation metadata. The layer UI is generated from the registry, allowing more source-backed layers without duplicating navigation logic. Invalid or unsourced features are omitted; unavailable categories remain visible with an explanation and disabled toggle. Existing POI filters and the new layer controls share one state and persist locally.

`data/boundaries-v2.geojson` separates land-management, wilderness and broad camping-rule applicability features. Geometry is never inferred from a camping description. Each community boundary links to its OSM relation; rule summaries link to an official site and carry a reviewed date. Geometry edit date is separate from rule-review date. No map shape establishes exact cadastral ownership or identifies a usable tent site.

Offline pack/schema/cache names are v2; entry points remain `index.html`, `manifest.webmanifest` and `sw.js`. Unchanged source datasets and icons retain v1 filenames. The old pack is not deleted. Users must explicitly download and verify the v2 pack; a v1 verified state is not reused. The v2 service worker handles only same-origin GETs, and provider tiles never enter Cache Storage or the build manifest. Standard OSM tiles use normal browser HTTP caching under the provider policy; this is not an offline-pack guarantee.

The default style and startup make no provider requests. Restoring a saved online style starts with a clearly labelled local topographic fallback, requiring a user action to request online tiles. No polling, prefetch, continuous GPS, background refresh or animated map transitions are added.

Stage B can add independently sourced waypoint metadata using stable waypoint IDs and per-field provenance. It must preserve original positions and separate trail distance from access travel. No enriched hut/water/resupply database is implemented here.

Stage C can consume immutable selected-section results and route version IDs in a separate optional planning module. It must not infer legal tent sites from management polygons, alter navigation state, or erase original plans. No itinerary generator, campsite recommendation or daily-miles interface is implemented here.
