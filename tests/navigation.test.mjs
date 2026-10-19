import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  haversine,
  prepareRoute,
  pointAt,
  nearestPoint,
  selectSection,
  reverseSection,
  gradeClass,
  visibleSection,
  distanceIntoSection,
  smoothElevation,
} from "../src/navigation.js";
const square = prepareRoute({
  coordinates: [
    [0, 0, 100],
    [0.01, 0, 200],
    [0.01, 0.01, 250],
    [0, 0.01, 150],
  ],
});
const near = (a, b, tolerance = 0.01) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test("haversine uses measured horizontal great-circle distances", () => {
  near(haversine([0, 0], [1, 0]), 111195.0802, 0.001);
  assert.equal(haversine([1, 2], [1, 2]), 0);
  near(square.total, 4447.8032, 0.1);
});
test("fractional endpoints interpolate positions and elevation", () => {
  const p = pointAt(square, square.edges[0] / 2);
  near(p.coordinate[0], 0.005, 1e-9);
  near(p.coordinate[2], 150, 1e-9);
  near(nearestPoint(square, [0.005, -0.001]).station, square.edges[0] / 2);
});
test("clockwise origin crossing includes tail and head exactly once", () => {
  const s = selectSection(square, square.total - 200, 300, 1);
  near(s.distance, 500);
  near(s.profile[0].station, square.total - 200);
  near(s.profile.at(-1).station, 300);
  assert.ok(
    s.profile.every(
      (p, i) => i === 0 || p.distance > s.profile[i - 1].distance,
    ),
  );
});
test("counterclockwise origin crossing includes head and tail exactly once", () => {
  const s = selectSection(square, 300, square.total - 200, -1);
  near(s.distance, 500);
  near(s.profile.at(-1).station, square.total - 200);
});
test("opposite direction chooses complementary arc", () => {
  const cw = selectSection(square, 200, 1700, 1),
    ccw = selectSection(square, 200, 1700, -1);
  near(cw.distance + ccw.distance, square.total);
});
test("reversing a section preserves distance and swaps gain and loss", () => {
  const a = selectSection(square, square.total - 400, 2000, 1);
  const b = reverseSection(a),
    r = selectSection(square, b.start, b.end, b.direction, b.full);
  near(a.distance, r.distance);
  near(a.ascent, r.descent, 1);
  near(a.descent, r.ascent, 1);
  near(a.min, r.min, 1);
  near(a.max, r.max, 1);
});
test("same endpoints mean empty selection unless entire loop explicitly selected", () => {
  assert.equal(selectSection(square, 0, 0).distance, 0);
  const full = selectSection(square, 350, 350, -1, true);
  near(full.distance, square.total);
  near(full.ascent, full.descent, 0.1);
});
test("absolute grade classes share uphill/downhill colors and exact thresholds", () => {
  for (const [g, k] of [
    [0, 0],
    [5, 0],
    [5.001, 1],
    [10, 1],
    [10.001, 2],
    [15, 2],
    [15.001, 3],
  ]) {
    assert.equal(gradeClass(g), k);
    assert.equal(gradeClass(-g), k);
  }
});
test("profile grades equal smoothed vertical change over actual horizontal distance", () => {
  const s = selectSection(square, 200, 900);
  for (let i = 1; i < s.profile.length; i++) {
    const a = s.profile[i - 1],
      b = s.profile[i];
    near(
      b.grade,
      ((b.elevation - a.elevation) / (b.distance - a.distance)) * 100,
      1e-8,
    );
  }
  near(s.ascent, s.profile.at(-1).elevation - s.profile[0].elevation);
  assert.equal(s.descent, 0);
});
test("triangular smoothing attenuates a narrow elevation spike", () => {
  const spike = prepareRoute({
    coordinates: [
      [0, 0, 0],
      [0.001, 0, 0],
      [0.0011, 0, 100],
      [0.0012, 0, 0],
      [0.002, 0, 0],
      [0.002, 0.002, 0],
      [0, 0.002, 0],
    ],
  });
  assert.ok(smoothElevation(spike, spike.stations[2]) < 70);
});
test("gap crossings withhold complete statistics in either direction", () => {
  const r = prepareRoute({ coordinates: square.coordinates, gapAfter: [1] });
  for (const direction of [1, -1]) {
    const s = selectSection(r, 100, 100, direction, true);
    assert.equal(s.valid, false);
    assert.equal(s.distance, null);
    assert.equal(s.ascent, null);
    assert.equal(s.descent, null);
    near(s.knownDistance, r.measured);
    assert.ok(s.profile.some((p) => p.breakBefore));
  }
});
test("gap detection handles both the loop origin and partial gap overlaps", () => {
  const r = prepareRoute({ coordinates: square.coordinates, gapAfter: [3] });
  assert.equal(selectSection(r, r.total - 100, 100, 1).valid, false);
  assert.equal(selectSection(r, 100, r.total - 100, -1).valid, false);
  assert.equal(selectSection(r, 100, 900, 1).valid, true);
  assert.equal(selectSection(r, 100, 900, -1).valid, false);
});
test("nearest-point snapping never invents points on a gap", () => {
  const r = prepareRoute({ coordinates: square.coordinates, gapAfter: [0] });
  assert.notEqual(pointAt(r, nearestPoint(r, [0.005, 0]).station).edge, 0);
});
test("waypoint distances follow the selected trail across origin", () => {
  const s = selectSection(square, square.total - 200, 300);
  near(distanceIntoSection(square, s, 100), 300);
  assert.equal(distanceIntoSection(square, s, 1000), null);
});
test("visible section picks the longest contiguous visible run across origin", () => {
  const v = visibleSection(square, (p) => p[0] === 0);
  near(v.start, square.stations[3]);
  near(v.end, 0);
  assert.equal(v.full, false);
  assert.equal(visibleSection(square, () => true).full, true);
  assert.equal(
    visibleSection(square, () => false),
    null,
  );
});
test("retained TRT snapshot has clockwise orientation, real elevations, and explicit gap", async () => {
  const data = JSON.parse(
    await readFile(new URL("../data/route-v1.json", import.meta.url)),
  );
  const r = prepareRoute(data);
  assert.equal(r.gaps.size, 1);
  assert.ok(r.measured > 260000 && r.measured < 280000);
  assert.ok(r.coordinates.every((p) => p[2] > 1800 && p[2] < 3300));
  const area = r.coordinates.reduce((s, a, i) => {
    const b = r.coordinates[(i + 1) % r.coordinates.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);
  assert.ok(area < 0);
  assert.equal(selectSection(r, 0, 30000).valid, true);
  assert.equal(selectSection(r, 0, 0, 1, true).distance, null);
});
test("bad geometry and direction fail explicitly", () => {
  assert.throws(() =>
    prepareRoute({
      coordinates: [
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 1],
      ],
    }),
  );
  assert.throws(() => selectSection(square, 0, 100, 0));
});

test("real-data reversal uses the same smoothed samples even at fractional endpoints", async () => {
  const r = prepareRoute(
    JSON.parse(
      await readFile(new URL("../data/route-v1.json", import.meta.url)),
    ),
  );
  for (const [start, end] of [
    [105.7, 32013.8],
    [1000.2, 17001.1],
    [20000.9, 135123.4],
  ]) {
    const a = selectSection(r, start, end),
      v = reverseSection(a),
      b = selectSection(r, v.start, v.end, v.direction);
    near(a.ascent, b.descent, 1e-6);
    near(a.descent, b.ascent, 1e-6);
    near(a.min, b.min, 1e-6);
    near(a.max, b.max, 1e-6);
  }
});
