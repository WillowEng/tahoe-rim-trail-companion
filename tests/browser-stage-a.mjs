// Stage A integration checks. Provider responses are intercepted: never prefetch real provider tiles in QA.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const origin = process.env.PREVIEW_ORIGIN || "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  console.log("PASS", message);
  checks++;
};
const leaflet = await readFile(
  new URL("../vendor/leaflet.js", import.meta.url),
  "utf8",
);
const tile = await readFile(
  new URL("../data/source/dem/340/781.png", import.meta.url),
);
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  let providerRequests = 0;
  const errors = [];
  await context.route("**/vendor/leaflet.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body:
        leaflet +
        (route.request().resourceType() === "script"
          ? "\nL.Map.addInitHook(function(){window.__qaMap=this;});"
          : ""),
    }),
  );
  await context.route(
    /https:\/\/(basemap\.nationalmap\.gov|tile\.openstreetmap\.org)\//,
    (route) => {
      providerRequests++;
      return route.fulfill({ contentType: "image/png", body: tile });
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/tahoe-rim-trail-companion/");
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  check(
    providerRequests === 0,
    "offline-first startup makes no provider requests",
  );
  const mapBox = await page.locator("#map").boundingBox();
  check(mapBox.height > 844 * 0.6, "mobile map dominates the usable screen");
  const before = await page.evaluate(() => ({
    center: window.__qaMap.getCenter(),
    zoom: window.__qaMap.getZoom(),
    a: document.querySelector("#start-position").textContent,
    b: document.querySelector("#end-position").textContent,
  }));
  await page.locator("#layers-toggle").click();
  check(
    await page.locator("#layers-panel").isVisible(),
    "independent layer panel opens",
  );
  for (const style of ["terrain", "satellite", "standard", "topographic"]) {
    const count = providerRequests;
    await page.locator("#map-style").selectOption(style);
    if (["satellite", "standard"].includes(style))
      await page.waitForFunction(
        (previous) =>
          window.__qaMap &&
          document.querySelectorAll(".leaflet-tile-loaded").length > 0,
        count,
      );
    const after = await page.evaluate(() => ({
      center: window.__qaMap.getCenter(),
      zoom: window.__qaMap.getZoom(),
      a: document.querySelector("#start-position").textContent,
      b: document.querySelector("#end-position").textContent,
    }));
    assert.deepEqual(after, before);
    check(true, style + " switching preserves map center, zoom and endpoints");
  }
  check(
    (await page.locator("#map-style-status").textContent()).includes(
      "Partial corridor",
    ),
    "local map coverage limits are disclosed",
  );
  check(
    !(await page.locator("#layer-federal").isDisabled()),
    "public-land footprint is available",
  );
  check(
    !(await page.locator("#layer-state").isDisabled()),
    "state-park boundary is available",
  );
  check(
    await page.locator("#layer-camp-potential").isDisabled(),
    "unsupported dispersed-camping permission is disabled",
  );
  check(
    await page.locator("#layer-camp-prohibited").isDisabled(),
    "precise prohibition geometry is not invented from broad rules",
  );
  check(
    (await page.locator("#layer-data-status").textContent()).includes(
      "8 sourced",
    ),
    "retained polygon coverage is disclosed",
  );
  check(
    await page.evaluate(
      () =>
        Number(getComputedStyle(window.__qaMap.getPane("tilePane")).zIndex) <
          Number(
            getComputedStyle(window.__qaMap.getPane("boundaries")).zIndex,
          ) &&
        Number(getComputedStyle(window.__qaMap.getPane("boundaries")).zIndex) <
          Number(
            getComputedStyle(window.__qaMap.getPane("overlayPane")).zIndex,
          ) &&
        document.querySelectorAll(".leaflet-tile-pane .leaflet-image-layer")
          .length === 13,
    ),
    "base imagery sits below visible polygons and the navigation route",
  );
  await page.locator("#layer-federal").check();
  check(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[role=button][aria-label="Lake Tahoe Basin Management Unit"]',
        ).length > 0,
    ),
    "polygon rings render as accessible paths",
  );
  await page.locator("#layer-wilderness").uncheck();
  check(
    await page.evaluate(
      () =>
        !document.querySelector(
          '[role=button][aria-label="Mount Rose Wilderness"]',
        ),
    ),
    "wilderness visibility toggles independently",
  );
  await page.locator("#layer-camp-permit").check();
  const permit = page.locator(
    '[role=button][aria-label="Desolation Wilderness — broad permit applicability"]',
  );
  await permit.focus();
  await page.keyboard.press("Enter");
  check(
    (await page.locator(".leaflet-popup-content").textContent()).includes(
      "Individual overnight quota-zone boundaries",
    ),
    "polygon popup discloses permit-zone limits",
  );
  check(
    (await page.locator(".leaflet-popup-content").textContent()).includes(
      "2026-10-20",
    ),
    "polygon popup carries verification date",
  );
  await page.evaluate(() => window.__qaMap.closePopup());
  await page.locator("#layer-poi-water").uncheck();
  check(
    (await page.locator(".poi-marker.water").count()) === 0,
    "layer manager controls existing water markers",
  );
  await page.locator("#layers-close").click();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  await page.locator("#layers-toggle").click();
  check(
    (await page.locator("#layer-federal").isChecked()) &&
      !(await page.locator("#layer-wilderness").isChecked()) &&
      !(await page.locator("#layer-poi-water").isChecked()),
    "polygon and waypoint preferences persist after reload",
  );
  await page.locator("#layer-poi-water").check();
  await page.locator("#layers-close").click();
  await page.locator("#profile-expand").click();
  check(
    (await page.locator(".profile-panel").boundingBox()).height > 180,
    "elevation panel expands",
  );
  await page.locator("#profile-collapse").click();
  check(
    !(await page.locator("#profile").isVisible()),
    "elevation panel collapses into map-only mode",
  );
  await page.locator("button[data-view=split]").click();
  await page.locator("#panel-toggle").click();
  check(
    (await page.locator("#map").boundingBox()).height > 300 &&
      (await page.locator("#section-panel").isVisible()),
    "section panel leaves the mobile map usable",
  );
  await page.locator("#panel-close").click();
  await page.locator("#profile").click({ position: { x: 200, y: 60 } });
  check(
    (await page.locator("#profile-readout").textContent()).includes("ft"),
    "linked map/profile interaction remains functional",
  );
  await page.locator("#offline-open").click();
  await page.locator("#download").click();
  await page.waitForFunction(() =>
    document.querySelector("#offline-label").textContent.includes("verified"),
  );
  await page.locator("#offline-dialog .dialog-close").click();
  const cached = await page.evaluate(async () => {
    const c = await caches.open("trt-v2-pack");
    return (await c.keys()).map((r) => r.url);
  });
  check(
    cached.some((x) => x.endsWith("/boundaries-v2.geojson")) &&
      cached.some((x) => x.endsWith("/relief-v2.json")) &&
      cached.every((x) => x.startsWith(origin)),
    "verified pack contains local polygons and relief but no online provider tiles",
  );
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  await page.locator("#layers-toggle").click();
  await page.locator("#map-style").selectOption("terrain");
  check(
    (await page.locator(".leaflet-image-layer").count()) === 13,
    "shaded terrain renders from offline pack",
  );
  await page.locator("#map-style").selectOption("satellite");
  check(
    (await page.getAttribute("body", "data-map-style")) === "topographic" &&
      (await page.locator("#style-brief").textContent()).includes(
        "needs internet",
      ),
    "online style falls back explicitly while offline",
  );
  check(
    await page.locator("#layer-federal").isChecked(),
    "local polygon preferences survive offline relaunch",
  );
  await page.locator("#layers-close").click();
  await page.locator("#offline-open").click();
  await page.locator("#verify").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#offline-status")
      .textContent.includes("files verified"),
  );
  check(
    true,
    "v2 overlays and both local styles pass offline hash verification",
  );
  check(errors.length === 0, "no uncaught Stage A browser errors");
  await context.close();
  const missing = await browser.newContext({ serviceWorkers: "block" });
  const mp = await missing.newPage();
  await mp.route("**/data/boundaries-v2.geojson", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await mp.goto(origin + "/");
  await mp.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  await mp.locator("#layers-toggle").click();
  check(
    (await mp.locator("#layer-data-status").textContent()).includes(
      "unavailable",
    ) && (await mp.locator("#layer-wilderness").isDisabled()),
    "missing GIS data leaves navigation functional and layers honestly unavailable",
  );
  await missing.close();
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const dp = await desktop.newPage();
  await dp.goto(origin + "/");
  await dp.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  const width = (await dp.locator("#map").boundingBox()).width;
  await dp.locator("#panel-close").click();
  check(
    (await dp.locator("#map").boundingBox()).width > width,
    "desktop section panel collapses to expand the map",
  );
  await dp.screenshot({
    path: "test-results/stage-a-desktop.png",
    fullPage: true,
  });
  await desktop.close();
  console.log(
    checks +
      " Stage A browser checks passed. Provider tiles were mocked; this does not verify live provider availability.",
  );
} finally {
  await browser.close();
}
