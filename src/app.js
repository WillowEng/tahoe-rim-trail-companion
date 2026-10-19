import {
  prepareRoute,
  pointAt,
  nearestPoint,
  selectSection,
  reverseSection,
  visibleSection,
  distanceIntoSection,
  METERS_PER_MILE as MI,
  FEET_PER_METER as FT,
} from "./navigation.js";
import { downloadPack, verifyPack } from "./offline.js";
const $ = (id) => document.getElementById(id),
  fmt = (x, n = 0) =>
    x === null
      ? "—"
      : x.toLocaleString(undefined, {
          maximumFractionDigits: n,
          minimumFractionDigits: n,
        }),
  latlng = (p) => [p[1], p[0]];
let route,
  section,
  map,
  selectionLayer,
  routeLayer,
  highlight,
  locationMarker,
  startMarker,
  endMarker,
  poiLayer,
  waypoints = [],
  state = { start: 0, end: 0, direction: 1, full: false },
  picking = null;
const visibleKinds = new Set(["water", "camp", "town"]);
let toastTimer,
  profileIndex = 0;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5500);
}
function openPanel() {
  document.body.dataset.panel = "open";
}
function closePanel() {
  delete document.body.dataset.panel;
}
$("panel-toggle").onclick = () =>
  document.body.dataset.panel === "open" ? closePanel() : openPanel();
$("summary-open").onclick = openPanel;
$("panel-close").onclick = closePanel;
$("offline-open").onclick = () => $("offline-dialog").showModal();
$("sources-open").onclick = () => $("sources-dialog").showModal();
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
function setView(view) {
  document.body.dataset.view = view;
  for (const b of document.querySelectorAll("button[data-view]"))
    b.setAttribute("aria-pressed", b.dataset.view === view);
  requestAnimationFrame(() => map?.invalidateSize());
}
for (const b of document.querySelectorAll("button[data-view]"))
  b.onclick = () => setView(b.dataset.view);
function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const markerIcon = (text, end = false) =>
  L.divIcon({
    className: "route-marker" + (end ? " end" : ""),
    html: text,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
function storeState() {
  try {
    localStorage.setItem("trt-v1-section", JSON.stringify(state));
  } catch {
    /* Storage restriction must not block navigation. */
  }
}
function setEndpoint(which, station) {
  const p = pointAt(route, station);
  if (p.gap) {
    toast(
      "That stretch is missing from the source. Choose a mapped trail point.",
    );
    return;
  }
  state[which] = p.station;
  state.full = false;
  $(which + "-waypoint").value = "";
  render();
}
function render() {
  section = selectSection(
    route,
    state.start,
    state.end,
    state.direction,
    state.full,
  );
  storeState();
  $("cw").setAttribute("aria-pressed", state.direction === 1);
  $("ccw").setAttribute("aria-pressed", state.direction === -1);
  $("section-name").textContent = state.full
    ? "The entire rim"
    : "Your trail section";
  for (const which of ["start", "end"]) {
    const p = pointAt(route, state[which]);
    $(which + "-slider").value = Math.round(
      (state[which] / route.total) * 10000,
    );
    $(which + "-position").textContent =
      `${p.coordinate[1].toFixed(5)}°, ${p.coordinate[0].toFixed(5)}°`;
    (which === "start" ? startMarker : endMarker).setLatLng(
      latlng(p.coordinate),
    );
  }
  $("gap-warning").hidden = section.valid;
  $("distance").textContent = section.valid
    ? fmt(section.distance / MI, 1)
    : "Incomplete";
  $("gain").textContent = fmt(
    section.ascent === null ? null : section.ascent * FT,
  );
  $("loss").textContent = fmt(
    section.descent === null ? null : section.descent * FT,
  );
  $("high").textContent = fmt(section.max === null ? null : section.max * FT);
  $("low").textContent = fmt(section.min === null ? null : section.min * FT);
  $("summary-distance").textContent = section.valid
    ? `${fmt(section.distance / MI, 1)} mi · ↑ ${fmt(section.ascent * FT)} ft`
    : "Source gap · totals unavailable";
  selectionLayer.clearLayers();
  let line = [];
  for (const p of section.profile) {
    if (p.elevation === null || p.breakBefore) {
      if (line.length > 1)
        L.polyline(line, {
          color: "#f7fbef",
          weight: 8,
          opacity: 0.95,
          interactive: false,
        }).addTo(selectionLayer);
      if (line.length > 1)
        L.polyline(line, {
          color: "#226852",
          weight: 4,
          interactive: false,
        }).addTo(selectionLayer);
      line = [];
    }
    if (p.elevation !== null) line.push(latlng(p.coordinate));
  }
  if (line.length > 1) {
    L.polyline(line, { color: "#f7fbef", weight: 8, interactive: false }).addTo(
      selectionLayer,
    );
    L.polyline(line, { color: "#226852", weight: 4, interactive: false }).addTo(
      selectionLayer,
    );
  }
  highlight?.remove();
  highlight = null;
  drawProfile();
  renderWaypoints();
  $("profile-readout").textContent = section.span
    ? "Tap the profile to explore"
    : "Choose a different end point";
}
function profileXY(p) {
  const lo = section.min ?? 0,
    hi = section.max ?? 1;
  return {
    x: 60 + (section.span ? p.distance / section.span : 0) * 820,
    y: 142 - ((p.elevation - lo) / Math.max(100, hi - lo)) * 117,
    lo,
    hi,
  };
}
function drawProfile() {
  const svg = $("profile");
  let html = "";
  const valid = section.profile.filter((p) => p.elevation !== null);
  const lo = valid.length ? Math.min(...valid.map((p) => p.elevation)) : 0,
    hi = valid.length ? Math.max(...valid.map((p) => p.elevation)) : 1;
  for (let i = 0; i < 4; i++) {
    const y = 142 - i * 39;
    html += `<line x1="60" x2="880" y1="${y}" y2="${y}" stroke="#e5e9df"/><text x="48" y="${y + 4}" text-anchor="end" font-size="11" fill="#74816d">${fmt((lo + (Math.max(100, hi - lo) * i) / 3) * FT)}</text>`;
  }
  let area = [];
  function closeArea() {
    if (area.length > 1) {
      html += `<path d="M${area[0].x},142 L${area.map((p) => p.x + "," + p.y).join(" L")} L${area.at(-1).x},142Z" fill="#dbe6cb" opacity=".5"/>`;
    }
    area = [];
  }
  for (const p of section.profile) {
    if (p.elevation === null || p.breakBefore) closeArea();
    if (p.elevation !== null) area.push(profileXY(p));
  }
  closeArea();
  // Group adjacent segments by grade color; avoid thousands of SVG DOM nodes.
  let path = "",
    lastColor = null;
  function flush() {
    if (path)
      html += `<path d="${path}" fill="none" stroke="${lastColor}" stroke-width="2.5" stroke-linecap="round"/>`;
    path = "";
  }
  for (let i = 1; i < section.profile.length; i++) {
    const a = section.profile[i - 1],
      b = section.profile[i];
    if (b.breakBefore || a.elevation === null || b.elevation === null) {
      flush();
      lastColor = null;
      continue;
    }
    const x = profileXY(a),
      y = profileXY(b);
    if (b.color !== lastColor) {
      flush();
      lastColor = b.color;
      path = `M${x.x},${x.y}`;
    }
    path += ` L${y.x},${y.y}`;
  }
  flush();
  for (let i = 0; i < 5; i++) {
    const x = 60 + (820 * i) / 4;
    html += `<text x="${x}" y="164" text-anchor="middle" font-size="11" fill="#74816d">${section.valid ? fmt(((section.span / MI) * i) / 4, 1) + " mi" : Math.round(i * 25) + "%"}</text>`;
  }
  if (!section.valid)
    html +=
      '<text x="470" y="13" text-anchor="middle" font-size="11" fill="#a55e28">Incomplete section · x-axis includes an unmeasured gap interval</text>';
  for (const w of waypoints) {
    if (!visibleKinds.has(w.type) || w.snap.offset > 1000) continue;
    const d = distanceIntoSection(route, section, w.snap.station);
    if (d === null) continue;
    const p = section.profile.reduce((a, b) =>
      Math.abs(a.distance - d) < Math.abs(b.distance - d) ? a : b,
    );
    if (p.elevation === null) continue;
    const xy = profileXY(p);
    html += `<circle cx="${xy.x}" cy="${xy.y}" r="3.5" fill="${w.type === "water" ? "#3c82a0" : w.type === "camp" ? "#976345" : "#67755b"}" stroke="white" stroke-width="1.2"><title>${escapeHTML(w.name)}</title></circle>`;
  }
  svg.innerHTML = html + '<g id="profile-cursor"></g>';
}
function highlightProfile(station, pan = false) {
  const d = distanceIntoSection(route, section, station);
  if (d === null) {
    $("profile-readout").textContent =
      "This trail point is outside the selected section.";
    return;
  }
  let best = 0;
  for (let i = 1; i < section.profile.length; i++)
    if (
      Math.abs(section.profile[i].distance - d) <
      Math.abs(section.profile[best].distance - d)
    )
      best = i;
  profileIndex = best;
  const p = section.profile[best];
  if (p.elevation === null) {
    $("profile-readout").textContent = "No source data in this interval.";
    return;
  }
  const xy = profileXY(p);
  $("profile-cursor").innerHTML =
    `<line x1="${xy.x}" x2="${xy.x}" y1="18" y2="144" stroke="#193e35" stroke-dasharray="3 3"/><circle cx="${xy.x}" cy="${xy.y}" r="5" fill="#193e35" stroke="white" stroke-width="2"/>`;
  $("profile-readout").textContent =
    `${section.valid ? fmt(p.distance / MI, 2) + " mi" : fmt((p.distance / Math.max(1, section.span)) * 100) + "% of traversal"} · ${fmt(p.elevation * FT)} ft · ${fmt(p.grade, 1)}% grade`;
  if (!highlight)
    highlight = L.circleMarker(latlng(p.coordinate), {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: "#193e35",
      fillOpacity: 1,
    }).addTo(map);
  else highlight.setLatLng(latlng(p.coordinate));
  if (pan) map.panTo(latlng(p.coordinate), { animate: false });
}
$("profile").addEventListener("click", (e) => {
  if (!section?.profile.length) return;
  const r = $("profile").getBoundingClientRect(),
    svg = $("profile"),
    matrix = svg.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
    matrix.inverse(),
  );
  const distance =
    Math.max(0, Math.min(1, (point.x - 60) / 820)) * section.span;
  const p = section.profile.reduce((a, b) =>
    Math.abs(a.distance - distance) < Math.abs(b.distance - distance) ? a : b,
  );
  highlightProfile(p.station, true);
});
$("profile").addEventListener("keydown", (e) => {
  if (!section || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
    return;
  e.preventDefault();
  profileIndex =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? section.profile.length - 1
        : Math.max(
            0,
            Math.min(
              section.profile.length - 1,
              profileIndex + (e.key === "ArrowRight" ? 1 : -1) * 5,
            ),
          );
  highlightProfile(section.profile[profileIndex].station, true);
});
function popup(w) {
  const root = document.createElement("div"),
    title = document.createElement("b");
  title.textContent = w.name;
  root.append(title);
  const desc = document.createElement("p");
  desc.textContent = `${w.type} · ${fmt(w.snap.offset)} m from mapped trail. Source updated ${w.updated?.slice(0, 10) || "unknown"}. ${w.type === "water" ? "Availability and potability unverified." : w.type === "camp" ? "Camping permission unverified." : ""}`;
  root.append(desc);
  const actions = document.createElement("div");
  actions.className = "popup-actions";
  for (const which of ["start", "end"]) {
    const b = document.createElement("button");
    b.textContent = `Use as ${which}`;
    b.onclick = () => {
      setEndpoint(which, w.snap.station);
      $(which + "-waypoint").value = w.id;
      map.closePopup();
    };
    actions.append(b);
  }
  root.append(actions);
  return root;
}
function renderWaypoints() {
  poiLayer.clearLayers();
  const along = [],
    occupied = [];
  const overview = map.getZoom() < 11;
  for (const w of waypoints) {
    if (!visibleKinds.has(w.type)) continue;
    const pixel = map.latLngToContainerPoint(latlng(w.coordinates));
    const crowded = overview && occupied.some((p) => p.distanceTo(pixel) < 25);
    if (!crowded) occupied.push(pixel);
    const icon = L.divIcon({
      className: "poi-marker " + w.type + (overview ? " overview" : ""),
      html:
        w.type === "water"
          ? "≋"
          : w.type === "camp"
            ? "△"
            : w.type === "town"
              ? "▣"
              : "·",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const marker = crowded
      ? null
      : L.marker(latlng(w.coordinates), { icon, keyboard: true, title: w.name })
          .addTo(poiLayer)
          .bindPopup(() => popup(w));
    w.marker = marker;
    const distance = distanceIntoSection(route, section, w.snap.station);
    if (distance !== null) along.push({ ...w, distance });
  }
  along.sort((a, b) => a.distance - b.distance);
  $("waypoint-count").textContent = `${along.length} places`;
  $("waypoint-list").replaceChildren();
  for (const w of along) {
    const b = document.createElement("button");
    b.className = "waypoint-row";
    b.innerHTML = `<span>${escapeHTML(w.name)}<small>${escapeHTML(w.type)} · ${fmt(w.snap.offset)} m off trail</small></span><span>${section.valid ? fmt(w.distance / MI, 1) + " mi" : "—"}</span>`;
    b.onclick = () => {
      setView("split");
      closePanel();
      map.setView(latlng(w.coordinates), 13, { animate: false });
      waypoints.find((p) => p.id === w.id)?.marker?.openPopup();
      highlightProfile(w.snap.station);
    };
    $("waypoint-list").append(b);
  }
}
function fitSelection() {
  if (!section) return;
  const points = section.profile
    .filter((p) => p.elevation !== null)
    .map((p) => latlng(p.coordinate));
  if (points.length > 1)
    map.fitBounds(L.latLngBounds(points), {
      padding: [45, 45],
      animate: false,
      maxZoom: 14,
    });
}
$("fit").onclick = fitSelection;
for (const [id, direction] of [
  ["cw", 1],
  ["ccw", -1],
])
  $(id).onclick = () => {
    if (!route) return;
    state.direction = direction;
    render();
  };
$("reverse").onclick = () => {
  if (!section) return;
  state = reverseSection(section);
  const a = $("start-waypoint").value;
  $("start-waypoint").value = $("end-waypoint").value;
  $("end-waypoint").value = a;
  render();
};
$("entire").onclick = () => {
  if (!route) return;
  state.full = true;
  state.end = state.start;
  render();
  fitSelection();
};
$("visible").onclick = () => {
  if (!route) return;
  const result = visibleSection(route, (p) =>
    map.getBounds().contains(latlng(p)),
  );
  if (!result) {
    toast("No continuous trail section is visible. Zoom out or move the map.");
    return;
  }
  state = { ...result, direction: 1 };
  $("start-waypoint").value = "";
  $("end-waypoint").value = "";
  render();
};
for (const which of ["start", "end"]) {
  $("pick-" + which).onclick = () => {
    if (!route) return;
    picking = which;
    setView("map");
    closePanel();
    $("map-notice").textContent =
      `Tap the mapped trail to set ${which === "start" ? "A · start" : "B · end"}. Markers also drag along the trail.`;
    toast("Tap the trail to place your " + which + ".");
  };
  $(which + "-slider").addEventListener("change", (e) => {
    if (route)
      setEndpoint(which, (Number(e.target.value) / 10000) * route.total);
  });
  $(which + "-waypoint").onchange = (e) => {
    const w = waypoints.find((w) => w.id === e.target.value);
    if (w) {
      setEndpoint(which, w.snap.station);
      e.target.value = w.id;
    }
  };
}
for (const input of document.querySelectorAll("[data-kind]"))
  input.onchange = () => {
    input.checked
      ? visibleKinds.add(input.dataset.kind)
      : visibleKinds.delete(input.dataset.kind);
    if (section) {
      renderWaypoints();
      drawProfile();
    }
  };
function showLastLocation(p) {
  $("last-location").textContent =
    `Last fix: ${new Date(p.timestamp).toLocaleString()} · accuracy ±${fmt(p.accuracy)} m. GPS is off.`;
  if (locationMarker) locationMarker.remove();
  locationMarker = L.circleMarker([p.lat, p.lon], {
    radius: 7,
    color: "#fff",
    weight: 3,
    fillColor: "#287bae",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindPopup($("last-location").textContent);
}
$("locate").onclick = () => {
  if (!map || !navigator.geolocation) {
    toast("Geolocation is unavailable. Use Safari over HTTPS.");
    return;
  }
  $("locate").disabled = true;
  $("locate").textContent = "Acquiring…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const p = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      try {
        localStorage.setItem("trt-v1-position", JSON.stringify(p));
      } catch {}
      showLastLocation(p);
      map.panTo([p.lat, p.lon], { animate: false });
      $("locate").disabled = false;
      $("locate").textContent = "⌖ Locate me";
      toast(`Position received (±${fmt(p.accuracy)} m). GPS request finished.`);
    },
    (error) => {
      $("locate").disabled = false;
      $("locate").textContent = "⌖ Locate me";
      toast(
        error.code === 1
          ? "Location permission was denied. No tracking is active."
          : "No location fix within the request timeout. Try again when needed.",
      );
    },
    { enableHighAccuracy: false, maximumAge: 0, timeout: 12000 },
  );
};
let busy = false;
function offlineState(verified, message) {
  $("offline-dot").classList.toggle("verified", verified);
  $("offline-label").textContent = verified
    ? "Pack verified · v1"
    : "Offline downloads";
  $("offline-status").textContent = message;
}
async function handlePack(download) {
  if (busy) return;
  busy = true;
  $("download").disabled = true;
  $("verify").disabled = true;
  $("download-progress").hidden = false;
  offlineState(
    false,
    download
      ? "Downloading and checking files…"
      : "Checking every stored file…",
  );
  try {
    const result = await (download ? downloadPack : verifyPack)(
      (p) => ($("download-progress").value = p),
    );
    offlineState(
      true,
      `All ${result.resources.length} files verified locally at ${new Date().toLocaleTimeString()}. Source gap and terrain limits still apply.`,
    );
    $("pack-size").textContent =
      `${(result.resources.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)} MiB · verified with SHA-256`;
    toast("Local pack verified. Test the installed app in Airplane Mode.");
  } catch (error) {
    offlineState(false, error.message);
    toast(error.message);
  } finally {
    busy = false;
    $("download").disabled = false;
    $("verify").disabled = false;
    $("download-progress").hidden = true;
  }
}
$("download").onclick = () => handlePack(true);
$("verify").onclick = () => handlePack(false);
async function init() {
  if (!window.L)
    throw Error("The local map library could not load. Reload when online.");
  const files = await Promise.all(
    ["route-v1", "waypoints-v1", "terrain-v1"].map(async (file) => {
      const response = await fetch(
        new URL("../data/" + file + ".json", import.meta.url),
      );
      if (!response.ok)
        throw Error(
          "Trail files are unavailable. Download the pack while online.",
        );
      return response.json();
    }),
  );
  route = prepareRoute(files[0]);
  waypoints = files[1].map((w) => ({
    ...w,
    snap: nearestPoint(route, w.coordinates),
  }));
  state.end = 20 * MI;
  try {
    const saved = JSON.parse(localStorage.getItem("trt-v1-section"));
    if (
      saved &&
      [saved.start, saved.end].every(
        (s) => Number.isFinite(s) && s >= 0 && s < route.total,
      ) &&
      [1, -1].includes(saved.direction)
    )
      state = saved;
  } catch {}
  map = L.map("map", {
    preferCanvas: true,
    zoomControl: false,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    inertia: false,
    minZoom: 8,
    maxZoom: 16,
  });
  map.fitBounds(L.latLngBounds(route.coordinates.map(latlng)), {
    padding: [24, 24],
    animate: false,
  });
  L.control.zoom({ position: "topright" }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(
    '© <a href="https://www.openstreetmap.org/copyright">OSM contributors</a> · Terrain: Mapzen / USGS',
  );
  for (const tile of files[2])
    L.imageOverlay(
      new URL("../" + tile.file, import.meta.url).href,
      tile.bounds,
      { interactive: false, opacity: 0.95 },
    ).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  selectionLayer = L.layerGroup().addTo(map);
  poiLayer = L.layerGroup().addTo(map);
  let line = [];
  for (let i = 0; i < route.coordinates.length; i++) {
    line.push(latlng(route.coordinates[i]));
    if (route.gaps.has(i)) {
      if (line.length > 1)
        L.polyline(line, {
          color: "#a1724c",
          weight: 3,
          opacity: 0.8,
          interactive: false,
        }).addTo(routeLayer);
      line = [];
    }
  }
  if (line.length) {
    line.push(latlng(route.coordinates[0]));
    L.polyline(line, {
      color: "#a1724c",
      weight: 3,
      opacity: 0.8,
      interactive: false,
    }).addTo(routeLayer);
  }
  // A gap marker describes absent geometry; never render a guessed connector.
  for (const gap of route.gaps)
    L.circleMarker(latlng(route.coordinates[gap]), {
      color: "#a33f2f",
      radius: 8,
      weight: 3,
      fillOpacity: 0.2,
    })
      .addTo(map)
      .bindPopup(
        "Missing source geometry near Ward Creek. Sections crossing this gap have no complete totals.",
      );
  for (const which of ["start", "end"]) {
    const marker = L.marker(latlng(pointAt(route, state[which]).coordinate), {
      icon: markerIcon(which === "start" ? "A" : "B", which === "end"),
      draggable: true,
      autoPan: false,
      zIndexOffset: 1000,
      title: `Drag ${which} along the sourced trail`,
    }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      setEndpoint(which, nearestPoint(route, [p.lng, p.lat]).station);
    });
    if (which === "start") startMarker = marker;
    else endMarker = marker;
    for (const w of waypoints) {
      const option = document.createElement("option");
      option.value = w.id;
      option.textContent = w.name + " · " + w.type;
      $(which + "-waypoint").append(option);
    }
  }
  map.on("click", (e) => {
    const snap = nearestPoint(route, [e.latlng.lng, e.latlng.lat]);
    const pixels = map.latLngToContainerPoint(latlng(snap.coordinate));
    if (pixels.distanceTo(e.containerPoint) > 35) {
      if (picking) toast("Tap closer to the mapped trail.");
      return;
    }
    if (picking) {
      setEndpoint(picking, snap.station);
      picking = null;
      $("map-notice").textContent =
        "Source: OSM 2022 · Ward Creek gap · terrain blank beyond pack coverage";
      setView("split");
    } else highlightProfile(snap.station);
  });
  render();
  map.on("zoomend moveend", renderWaypoints);
  $("map-notice").textContent =
    "Source: OSM 2022 · Ward Creek gap · terrain blank beyond pack coverage";
  try {
    const p = JSON.parse(localStorage.getItem("trt-v1-position"));
    if (p && [p.lat, p.lon, p.accuracy, p.timestamp].every(Number.isFinite))
      showLastLocation(p);
  } catch {}
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(
        new URL("../sw.js", import.meta.url),
        { scope: new URL("../", import.meta.url).pathname },
      );
      await navigator.serviceWorker.ready;
      await verifyPack();
      offlineState(
        true,
        "All stored pack files verified on this device. Source gap and terrain limitations remain.",
      );
    } catch (error) {
      offlineState(false, error.message);
    }
  } else
    offlineState(
      false,
      "Service workers are unavailable. Offline installation requires Safari over HTTPS.",
    );
}
init().catch((error) => {
  $("map-notice").textContent = error.message;
  toast(error.message);
  console.error(error);
});
