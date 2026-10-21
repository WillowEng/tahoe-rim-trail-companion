// Pure navigation calculations. Coordinates are WGS84 [longitude, latitude, meters].
export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.280839895;
const rad = (x) => (x * Math.PI) / 180;
export const mod = (x, n) => ((x % n) + n) % n;
export function haversine(a, b) {
  const p = rad(b[1] - a[1]),
    l = rad(b[0] - a[0]);
  const h =
    Math.sin(p / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(l / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function prepareRoute(data) {
  const coordinates = data.coordinates;
  if (
    coordinates.length < 3 ||
    coordinates.some((p) => p.length < 3 || p.some((v) => !Number.isFinite(v)))
  )
    throw Error("Invalid route coordinates or elevations");
  const gaps = new Set(data.gapAfter || []),
    stations = [0],
    edges = [];
  for (let i = 0; i < coordinates.length; i++) {
    const length = haversine(
      coordinates[i],
      coordinates[(i + 1) % coordinates.length],
    );
    if (length <= 0) throw Error("Duplicate consecutive route vertices");
    edges.push(length);
    stations.push(stations.at(-1) + length);
  }
  // Stations are an internal traversal index. Gap chords NEVER contribute to reported trail distance.
  return {
    coordinates,
    gaps,
    stations,
    edges,
    total: stations.at(-1),
    measured: edges.reduce((s, d, i) => s + (gaps.has(i) ? 0 : d), 0),
  };
}
export function pointAt(route, station) {
  const s = mod(station, route.total);
  let lo = 0,
    hi = route.coordinates.length;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (route.stations[m] <= s) lo = m;
    else hi = m;
  }
  const f = (s - route.stations[lo]) / route.edges[lo],
    a = route.coordinates[lo],
    b = route.coordinates[(lo + 1) % route.coordinates.length];
  return {
    station: s,
    edge: lo,
    coordinate: a.map((v, i) => v + (b[i] - v) * f),
    gap: route.gaps.has(lo) && f > 1e-8,
  };
}
export function nearestPoint(route, coordinate) {
  let best = { offset: Infinity };
  const scale = Math.cos(rad(coordinate[1]));
  for (let i = 0; i < route.coordinates.length; i++) {
    if (route.gaps.has(i)) continue;
    const a = route.coordinates[i],
      b = route.coordinates[(i + 1) % route.coordinates.length];
    const dx = (b[0] - a[0]) * scale,
      dy = b[1] - a[1];
    const f = Math.max(
      0,
      Math.min(
        1,
        ((coordinate[0] - a[0]) * scale * dx + (coordinate[1] - a[1]) * dy) /
          (dx * dx + dy * dy),
      ),
    );
    const p = a.map((v, j) => v + (b[j] - v) * f),
      offset = haversine(coordinate, p);
    if (offset < best.offset)
      best = {
        station: route.stations[i] + f * route.edges[i],
        coordinate: p,
        offset,
      };
  }
  return best;
}
export function gradeClass(grade) {
  const g = Math.abs(grade);
  return g <= 5 ? 0 : g <= 10 ? 1 : g <= 15 ? 2 : 3;
}
export const GRADE_COLORS = ["#388447", "#d0b12c", "#e18432", "#c4473e"];
export function sectionLength(route, start, end, direction = 1, full = false) {
  if (![1, -1].includes(direction)) throw Error("Direction must be 1 or -1");
  return full ? route.total : mod(direction * (end - start), route.total);
}
function gapIntervals(route, start, length, direction) {
  const intervals = [];
  for (const i of route.gaps) {
    // Unwrap the positive-coordinate gap interval around the selected start.
    for (let wrap = -2; wrap <= 2; wrap++) {
      const a = route.stations[i] + wrap * route.total,
        b = route.stations[i + 1] + wrap * route.total;
      const x = direction === 1 ? a - start : start - b,
        y = direction === 1 ? b - start : start - a;
      if (y > 0 && x < length)
        intervals.push([Math.max(0, x), Math.min(length, y)]);
    }
  }
  return intervals;
}
export function smoothElevation(route, station) {
  const center = pointAt(route, station);
  if (center.gap) return null;
  let total = 0,
    weight = 0;
  for (const offset of [-60, -30, 0, 30, 60]) {
    const intervals = gapIntervals(
      route,
      mod(station, route.total),
      Math.abs(offset),
      Math.sign(offset) || 1,
    );
    if (intervals.length) continue;
    const p = pointAt(route, station + offset);
    if (p.gap) continue;
    const w = 3 - Math.abs(offset) / 30;
    total += p.coordinate[2] * w;
    weight += w;
  }
  return total / weight;
}
export function selectSection(route, start, end, direction = 1, full = false) {
  start = mod(start, route.total);
  end = mod(end, route.total);
  const length = sectionLength(route, start, end, direction, full),
    gaps = gapIntervals(route, start, length, direction);
  const knownDistance = length - gaps.reduce((s, [a, b]) => s + b - a, 0);
  const breaks = [0, length, ...gaps.flat()].sort((a, b) => a - b);
  const distances = new Set(breaks);
  // A route-anchored 30 m grid gives identical samples when a section reverses.
  // Endpoint-relative grids can change gain/loss merely by reversing traversal.
  for (let station = 0; station < route.total; station += 30) {
    const d = mod(direction * (station - start), route.total);
    if (d > 1e-6 && d < length - 1e-6) distances.add(d);
  }
  const profile = [...distances]
    .sort((a, b) => a - b)
    .map((distance) => {
      const station = mod(start + direction * distance, route.total),
        p = pointAt(route, station);
      return {
        distance,
        station,
        coordinate: p.coordinate,
        elevation: smoothElevation(route, station),
        grade: 0,
        color: GRADE_COLORS[0],
      };
    });
  let ascent = 0,
    descent = 0;
  const steepness = [0, 0, 0, 0];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1],
      b = profile[i],
      d = b.distance - a.distance;
    if (
      gaps.some(([x, y]) => x < b.distance && y > a.distance) ||
      a.elevation === null ||
      b.elevation === null
    ) {
      b.breakBefore = true;
      continue;
    }
    const delta = b.elevation - a.elevation;
    b.grade = d ? (delta / d) * 100 : 0;
    b.color = GRADE_COLORS[gradeClass(b.grade)];
    steepness[gradeClass(b.grade)] += d;
    ascent += Math.max(delta, 0);
    descent += Math.max(-delta, 0);
  }
  const elevations = profile
    .filter((p) => p.elevation !== null)
    .map((p) => p.elevation);
  const valid = !gaps.length;
  return {
    start,
    end,
    direction,
    full,
    span: length,
    valid,
    gaps,
    knownDistance,
    distance: valid ? length : null,
    ascent: valid ? ascent : null,
    descent: valid ? descent : null,
    min: elevations.length ? Math.min(...elevations) : null,
    max: elevations.length ? Math.max(...elevations) : null,
    profile,
    steepness,
  };
}
export function distanceIntoSection(route, section, station) {
  const distance = mod(
    section.direction * (station - section.start),
    route.total,
  );
  return distance <= section.span + 1e-6 ? distance : null;
}
export function reverseSection(section) {
  return {
    start: section.end,
    end: section.start,
    direction: -section.direction,
    full: section.full,
  };
}
export function visibleSection(route, contains) {
  const n = route.coordinates.length,
    visible = route.coordinates.map(contains);
  if (visible.every(Boolean)) return { start: 0, end: 0, full: true };
  let count = 0,
    bestCount = 0,
    bestStart = 0;
  for (let k = 0; k < 2 * n; k++) {
    count = visible[k % n] ? count + 1 : 0;
    if (count > bestCount) {
      bestCount = count;
      bestStart = k - count + 1;
    }
  }
  if (bestCount < 2) return null;
  return {
    start: route.stations[bestStart % n],
    end: route.stations[(bestStart + bestCount - 1) % n],
    full: false,
  };
}
