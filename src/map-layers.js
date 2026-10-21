// Stage A mapping is independent of navigation and future planning modules.
export const STYLE_DEFINITIONS = [
  {
    id: "topographic",
    name: "Topographic",
    offline: true,
    description:
      "Local 100 m contours, terrain, TRT and waypoints. Partial corridor coverage; ~60 m source pixels.",
  },
  {
    id: "terrain",
    name: "Terrain",
    offline: true,
    description:
      "Local shaded relief. Same partial corridor coverage; no contour lines.",
  },
  {
    id: "satellite",
    name: "Satellite / aerial",
    offline: false,
    description:
      "USGS aerial imagery. Internet required; imagery dates and resolution vary. Not in the offline pack.",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
    maxNativeZoom: 16,
  },
  {
    id: "standard",
    name: "Standard",
    offline: false,
    description:
      "OpenStreetMap roads, trails and towns. Internet required. No offline tile downloads.",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxNativeZoom: 19,
  },
];
export const POLYGON_LAYERS = [
  {
    id: "federal",
    group: "Public land",
    name: "Federal management areas",
    color: "#538653",
    default: false,
    note: "Management boundaries can include private inholdings; not an ownership or camping-permission map.",
  },
  {
    id: "state",
    group: "Public land",
    name: "State parks",
    color: "#2e87a0",
    default: false,
    note: "Park boundaries; individual camping and access rules still apply.",
  },
  {
    id: "other",
    group: "Public land",
    name: "Other public lands",
    color: "#9e9347",
    default: false,
    note: "Only included where sourced polygons are available.",
  },
  {
    id: "wilderness",
    group: "Wilderness & protected areas",
    name: "Designated wilderness",
    color: "#7767a0",
    default: true,
    note: "Wilderness designation does not grant unrestricted camping permission.",
  },
  {
    id: "camp-permit",
    group: "Camping regulations",
    name: "Permit required",
    color: "#9b68aa",
    default: false,
    note: "Broad permit applicability area; quota subzones may be unavailable.",
  },
  {
    id: "camp-restricted",
    group: "Camping regulations",
    name: "Camping restricted",
    color: "#d08a31",
    default: false,
    note: "Area-wide restrictions; tap for designated-site and setback rules.",
  },
  {
    id: "camp-prohibited",
    group: "Camping regulations",
    name: "Camping prohibited",
    color: "#bc4e48",
    default: false,
    note: "Only explicitly mapped prohibition areas, never guessed buffers.",
  },
  {
    id: "camp-potential",
    group: "Camping regulations",
    name: "Potential dispersed camping",
    color: "#6d9652",
    default: false,
    note: "Does not guarantee a safe, accessible or legal tent site.",
  },
  {
    id: "camp-unknown",
    group: "Camping regulations",
    name: "Camping unknown / unverified",
    color: "#8c8c80",
    default: false,
    note: "Only sourced management footprints; unshaded land is also unverified.",
  },
];
const KEY = "trt-v2-map-preferences";
export function readPreferences(storage) {
  try {
    const p = JSON.parse(storage.getItem(KEY));
    return {
      style: STYLE_DEFINITIONS.some((s) => s.id === p?.style)
        ? p.style
        : "topographic",
      layers: p?.layers && typeof p.layers === "object" ? p.layers : {},
      kinds: Array.isArray(p?.kinds)
        ? p.kinds.filter((k) =>
            ["water", "camp", "town", "landmark"].includes(k),
          )
        : ["water", "camp", "town"],
    };
  } catch {
    return {
      style: "topographic",
      layers: {},
      kinds: ["water", "camp", "town"],
    };
  }
}
export function savePreferences(storage, p) {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* Navigation survives restricted storage. */
  }
}
export function validPolygon(feature) {
  const g = feature?.geometry;
  if (
    feature?.type !== "Feature" ||
    !["Polygon", "MultiPolygon"].includes(g?.type)
  )
    return false;
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return (
    Array.isArray(polygons) &&
    polygons.length > 0 &&
    polygons.every(
      (p) =>
        Array.isArray(p) &&
        p.length > 0 &&
        p.every(
          (r) =>
            Array.isArray(r) &&
            r.length >= 4 &&
            r.every(
              (c) =>
                Array.isArray(c) &&
                c.length >= 2 &&
                Number.isFinite(c[0]) &&
                Number.isFinite(c[1]) &&
                Math.abs(c[0]) <= 180 &&
                Math.abs(c[1]) <= 90,
            ) &&
            r[0][0] === r.at(-1)[0] &&
            r[0][1] === r.at(-1)[1] &&
            Math.abs(
              r
                .slice(1)
                .reduce(
                  (area, c, i) => area + r[i][0] * c[1] - c[0] * r[i][1],
                  0,
                ),
            ) > 1e-12,
        ),
    )
  );
}
export function usableFeatures(collection) {
  return (
    Array.isArray(collection?.features) ? collection.features : []
  ).filter(
    (f) =>
      validPolygon(f) &&
      POLYGON_LAYERS.some((l) => l.id === f.properties?.layer) &&
      typeof f.properties?.source === "string" &&
      /^https:\/\//.test(f.properties.source),
  );
}
export function createMapping({
  map,
  terrain,
  relief,
  boundaries,
  onKinds,
  getKinds,
  onMapClick,
}) {
  const $ = (id) => document.getElementById(id);
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = { getItem: () => null, setItem: () => {} };
  }
  const prefs = readPreferences(storage);
  onKinds(prefs.kinds);
  let active,
    tileErrors = 0,
    verified = false;
  const features = usableFeatures(boundaries),
    overlays = new Map();
  map.createPane("boundaries");
  map.getPane("boundaries").style.zIndex = 350;
  const renderer = L.svg({ pane: "boundaries" });
  const local = (paths) =>
    L.layerGroup(
      paths.map((t) =>
        L.imageOverlay(
          new URL("../" + t.file, import.meta.url).href,
          t.bounds,
          { interactive: false, opacity: 0.95, pane: "tilePane" },
        ),
      ),
    );
  function persist() {
    prefs.kinds = [...getKinds()];
    savePreferences(storage, prefs);
  }
  function status(extra = "") {
    const style = STYLE_DEFINITIONS.find((s) => s.id === prefs.style);
    $("map-style-status").textContent =
      style.description +
      " " +
      (style.offline
        ? verified
          ? "Local pack verified on this device."
          : "Download & verify the local pack before relying on offline access."
        : extra ||
          "Loads only when you select or reload this style; browser connectivity is not guaranteed.");
  }
  function useStyle(id, userAction = false) {
    const requested =
      STYLE_DEFINITIONS.find((s) => s.id === id) || STYLE_DEFINITIONS[0];
    prefs.style = requested.id;
    $("map-style").value = requested.id;
    if (active) map.removeLayer(active);
    tileErrors = 0;
    let style = requested;
    if (!requested.offline && (!userAction || navigator.onLine === false))
      style = STYLE_DEFINITIONS[0];
    const fallback = !requested.offline && style.offline;
    if (style.offline)
      active = local(style.id === "terrain" ? relief : terrain).addTo(map);
    else {
      // Retain local topography under missing online tiles. Never prefetch or add provider tiles to Cache Storage.
      const background = local(terrain);
      const tiles = L.tileLayer(style.url, {
        attribution: style.attribution,
        maxNativeZoom: style.maxNativeZoom,
        updateWhenIdle: true,
        keepBuffer: 0,
        detectRetina: false,
      });
      tiles.on("tileerror", () => {
        tileErrors++;
        status(
          "Provider tiles unavailable. Local topography remains underneath; use an offline style for verified coverage.",
        );
        $("style-brief").textContent =
          "Online tiles unavailable · local fallback";
      });
      active = L.layerGroup([background, tiles]).addTo(map);
    }
    document.body.dataset.mapStyle = style.id;
    $("style-brief").textContent = fallback
      ? `${requested.name} needs internet · showing local topo`
      : `${style.name} · ${style.offline ? "local corridor" : "online"}`;
    $("load-map-style").hidden = requested.offline;
    status(
      fallback
        ? "Showing local Topographic instead. Press Load selected style when connected; no automatic network retry."
        : "",
    );
    persist();
  }
  for (const style of STYLE_DEFINITIONS) {
    const option = document.createElement("option");
    option.value = style.id;
    option.textContent = `${style.name} · ${style.offline ? "offline pack" : "internet required"}`;
    $("map-style").append(option);
  }
  $("map-style").onchange = (e) => useStyle(e.target.value, true);
  $("load-map-style").onclick = () => useStyle(prefs.style, true);
  function featurePopup(feature) {
    const p = feature.properties,
      root = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = p.name || "Mapped area";
    root.append(title);
    const fields = {
      Classification: p.classification,
      Camping: p.campingClass || "Unknown / unverified",
      "Managing agency": p.agency,
      Regulations:
        p.regulations ||
        "No verified camping permission provided by this boundary.",
      "Permit requirements":
        p.permit || "Not verified; check the managing agency.",
      "Restrictions / limits": p.limits,
      "Dataset date": p.datasetDate || "Not supplied by source",
      "Information checked": p.verified || "Not verified",
    };
    for (const [label, value] of Object.entries(fields))
      if (value) {
        const row = document.createElement("p");
        row.textContent = `${label}: ${value}`;
        root.append(row);
      }
    for (const [label, url] of [
      ["Geographic source", p.source],
      ["Official regulations", p.officialWebsite],
    ])
      if (typeof url === "string" && /^https:\/\//.test(url)) {
        const a = document.createElement("a");
        a.textContent = label + " ↗";
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        root.append(a, document.createElement("br"));
      }
    return root;
  }
  const groups = new Map();
  function group(name) {
    if (!groups.has(name)) {
      const el = document.createElement("fieldset"),
        legend = document.createElement("legend");
      legend.textContent = name;
      el.append(legend);
      $("layer-groups").append(el);
      groups.set(name, el);
    }
    return groups.get(name);
  }
  for (const def of POLYGON_LAYERS) {
    const data = features.filter((f) => f.properties.layer === def.id);
    const layer = L.geoJSON(data, {
      renderer,
      pane: "boundaries",
      style: {
        color: def.color,
        weight: 1.5,
        fillOpacity: 0.13,
        dashArray: def.id.startsWith("camp-") ? "5 4" : null,
      },
      onEachFeature(feature, polygon) {
        const open = (e) => {
          if (e?.latlng && onMapClick(e)) return;
          const bounds = polygon.getBounds();
          L.popup({ maxWidth: 300, maxHeight: 260, autoPan: false })
            .setLatLng(e?.latlng || bounds.getCenter())
            .setContent(featurePopup(feature))
            .openOn(map);
        };
        polygon.on("click", open);
        polygon.on("add", () => {
          const path = polygon.getElement();
          if (path) {
            path.setAttribute("tabindex", "0");
            path.setAttribute("role", "button");
            path.setAttribute("aria-label", feature.properties.name);
            path.addEventListener("keydown", (e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                open();
              }
            });
          }
        });
      },
    });
    overlays.set(def.id, layer);
    const row = document.createElement("div");
    row.className = "layer-row";
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.id = "layer-" + def.id;
    input.checked =
      data.length > 0 &&
      (typeof prefs.layers[def.id] === "boolean"
        ? prefs.layers[def.id]
        : def.default);
    input.disabled = !data.length;
    const swatch = document.createElement("i");
    swatch.className = "layer-swatch";
    swatch.style.background = def.color;
    label.append(input, swatch, document.createTextNode(def.name));
    const note = document.createElement("small");
    note.textContent = data.length
      ? `${data.length} areas · local pack · ${def.note}`
      : `Unavailable: no verified polygons loaded. ${def.note}`;
    const details = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = "Source & coverage";
    details.append(summary);
    const text = document.createElement("p");
    text.textContent = data.length
      ? [
          ...new Set(
            data.map(
              (f) =>
                `${f.properties.agency || "Agency unknown"}; dataset ${f.properties.datasetDate || "date unknown"}; ${f.properties.source}`,
            ),
          ),
        ].join("\n")
      : boundaries?.unavailable?.[def.id] ||
        "No reliable geographic dataset retained. No boundary or camping permission inferred.";
    details.append(text);
    row.append(label, note, details);
    group(def.group).append(row);
    if (input.checked) layer.addTo(map);
    input.onchange = () => {
      input.checked ? layer.addTo(map) : map.removeLayer(layer);
      prefs.layers[def.id] = input.checked;
      persist();
    };
  }
  for (const [kind, name, category, color] of [
    ["camp", "Established camping points", "Camping points", "#976345"],
    ["water", "Water sources", "Water", "#3c82a0"],
    ["town", "Towns / resupply", "Resupply", "#76747d"],
    ["landmark", "Landmarks", "Trail information", "#57674a"],
  ]) {
    const row = document.createElement("div");
    row.className = "layer-row";
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.poiKind = kind;
    input.id = "layer-poi-" + kind;
    input.checked = getKinds().has(kind);
    const swatch = document.createElement("i");
    swatch.className = "layer-swatch point-swatch";
    swatch.style.background = color;
    label.append(input, swatch, document.createTextNode(name));
    const small = document.createElement("small");
    small.textContent =
      "OSM 2022 · local pack. Access, availability and camping permission unverified.";
    row.append(label, small);
    group(category).append(row);
    input.onchange = () => {
      const kinds = new Set(getKinds());
      input.checked ? kinds.add(kind) : kinds.delete(kind);
      onKinds([...kinds]);
      persist();
    };
  }
  const missing = document.createElement("p");
  missing.className = "quiet";
  missing.textContent =
    "Verified trailheads, huts, new water/resupply details and itinerary tools are not included in Stage A.";
  group("Trail information").append(missing);
  $("layer-data-status").textContent = features.length
    ? `${features.length} sourced polygon features retained locally (OSM; agency validation incomplete). Unshaded areas are not a statement of camping permission. Boundaries are for orientation, not legal surveys.`
    : "Polygon data is unavailable. Navigation still works; no land or camping boundaries have been invented.";
  useStyle(prefs.style);
  return {
    syncWaypoints() {
      for (const input of document.querySelectorAll("[data-poi-kind]"))
        input.checked = getKinds().has(input.dataset.poiKind);
      persist();
    },
    setVerified(value) {
      verified = value;
      status(
        tileErrors
          ? "Provider tiles unavailable; local fallback is displayed."
          : "",
      );
    },
    count: features.length,
  };
}
