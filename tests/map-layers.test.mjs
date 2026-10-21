import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  STYLE_DEFINITIONS,
  POLYGON_LAYERS,
  readPreferences,
  savePreferences,
  validPolygon,
  usableFeatures,
} from "../src/map-layers.js";

const square = {
  type: "Feature",
  properties: { layer: "wilderness", source: "https://example.org/source" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
};
test("layer preferences survive invalid JSON and restricted storage", () => {
  assert.equal(
    readPreferences({
      getItem() {
        throw Error();
      },
    }).style,
    "topographic",
  );
  assert.deepEqual(readPreferences({ getItem: () => "{bad" }).kinds, [
    "water",
    "camp",
    "town",
  ]);
  assert.doesNotThrow(() =>
    savePreferences(
      {
        setItem() {
          throw Error();
        },
      },
      {},
    ),
  );
  const p = readPreferences({
    getItem: () =>
      JSON.stringify({
        style: "unsupported",
        layers: { wilderness: false },
        kinds: ["water", "unknown"],
      }),
  });
  assert.equal(p.style, "topographic");
  assert.equal(p.layers.wilderness, false);
  assert.deepEqual(p.kinds, ["water"]);
});
test("styles distinguish local map packs from online-only providers", () => {
  assert.deepEqual(
    STYLE_DEFINITIONS.filter((s) => s.offline).map((s) => s.id),
    ["topographic", "terrain"],
  );
  for (const style of STYLE_DEFINITIONS.filter((s) => !s.offline))
    assert.ok(style.url.startsWith("https://"));
  assert.equal(
    new Set(POLYGON_LAYERS.map((l) => l.id)).size,
    POLYGON_LAYERS.length,
  );
});
test("malformed and unsourced geographic overlays are rejected", () => {
  assert.ok(validPolygon(square));
  assert.equal(
    validPolygon({
      ...square,
      geometry: { type: "LineString", coordinates: [] },
    }),
    false,
  );
  assert.equal(
    validPolygon({
      ...square,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 2],
          ],
        ],
      },
    }),
    false,
  );
  assert.equal(
    validPolygon({
      ...square,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [300, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    }),
    false,
  );
  assert.deepEqual(usableFeatures(null), []);
  assert.equal(
    usableFeatures({
      features: [
        square,
        {
          ...square,
          properties: { layer: "wilderness", source: "javascript:alert(1)" },
        },
        {
          ...square,
          properties: { layer: "fabricated", source: "https://example.org" },
        },
      ],
    }).length,
    1,
  );
});
test("retained boundary features have closed sourced rings, provenance, and no inferred legal camping", async () => {
  const collection = JSON.parse(
    await readFile(new URL("../data/boundaries-v2.geojson", import.meta.url)),
  );
  assert.ok(collection.features.length >= 8);
  assert.equal(usableFeatures(collection).length, collection.features.length);
  const layers = new Set(collection.features.map((f) => f.properties.layer));
  for (const id of [
    "federal",
    "state",
    "wilderness",
    "camp-permit",
    "camp-restricted",
    "camp-unknown",
  ])
    assert.ok(layers.has(id));
  assert.ok(!layers.has("camp-potential"));
  for (const f of collection.features) {
    const p = f.properties;
    for (const key of [
      "name",
      "agency",
      "classification",
      "regulations",
      "permit",
      "source",
      "officialWebsite",
      "datasetDate",
      "verified",
      "license",
      "limits",
    ])
      assert.ok(p[key], `${p.name}: ${key}`);
    if (["federal", "state", "wilderness"].includes(p.layer))
      assert.equal(p.campingClass, "Unknown / unverified");
  }
  assert.match(
    collection.features.find((f) => f.properties.layer === "camp-permit")
      .properties.limits,
    /quota-zone boundaries.*NOT mapped/,
  );
  assert.match(
    collection.features.find((f) => f.properties.layer === "camp-restricted")
      .properties.limits,
    /exception/,
  );
});
test("boundary source snapshots match their retained SHA-256 manifests", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../docs/boundary-sources-v2.json", import.meta.url),
    ),
  );
  for (const source of manifest.sources) {
    const raw = await readFile(new URL("../" + source.file, import.meta.url));
    assert.equal(createHash("sha256").update(raw).digest("hex"), source.sha256);
    assert.equal(raw.length, source.bytes);
    assert.ok(source.outerParts > 0);
  }
});
