// Optional integration QA: npm install --no-save --package-lock=false playwright@1.57.0
// Start `npm run dev` separately. Use CHROMIUM_EXECUTABLE for a system Chromium.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox"],
});
const origin = process.env.PREVIEW_ORIGIN || "http://localhost:4173";
let checks = 0;
const check = (value, message) => {
  assert.ok(value, message);
  console.log("PASS", message);
  checks++;
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    window.__gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(success) {
          window.__gpsCalls++;
          success({
            coords: { latitude: 39.1689, longitude: -120.1435, accuracy: 50 },
            timestamp: Date.now(),
          });
        },
      },
    });
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(origin)) external.push(r.url());
  });
  const response = await page.goto(origin + "/tahoe-rim-trail-companion/");
  check(response?.status() === 200, "preview document responds with HTTP 200");
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  if (process.env.PREVIEW_SCREENSHOT)
    await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT, fullPage: true });
  check(
    (await page.locator(".leaflet-container").count()) === 1,
    "map initializes at repository subpath",
  );
  check(
    (await page.locator("#profile path").count()) > 0,
    "real elevation profile rendered",
  );
  check(
    (await page.evaluate(() => window.__gpsCalls)) === 0,
    "startup never requests GPS",
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "390 px viewport has no horizontal overflow",
  );
  await page.locator("button[data-view=profile]").click();
  check(
    !(await page.locator("#map").isVisible()) &&
      (await page.locator("#profile").isVisible()),
    "full-profile mode",
  );
  await page.locator("#profile").click({ position: { x: 200, y: 120 } });
  check(
    (await page.locator("#profile-readout").textContent()).includes("ft"),
    "profile tap updates the shared cursor",
  );
  await page.locator("button[data-view=map]").click();
  check(
    (await page.locator("#map").isVisible()) &&
      !(await page.locator("#profile").isVisible()),
    "full-map mode",
  );
  await page.locator("button[data-view=split]").click();
  await page.locator("#panel-toggle").click();
  await page.locator("#reverse").click();
  check(
    (await page.locator("#distance").textContent()) === "20.0",
    "reverse preserves the selected arc",
  );
  await page.locator("#ccw").click();
  await page.locator("#cw").click();
  check(
    (await page.locator("#distance").textContent()) === "Incomplete",
    "complementary arc discloses the gap",
  );
  await page.locator("#entire").click();
  check(
    await page.locator("#gap-warning").isVisible(),
    "entire loop never claims a complete distance",
  );
  await page.locator("#start-slider").fill("100");
  await page.locator("#start-slider").dispatchEvent("change");
  await page.locator("#end-slider").fill("1200");
  await page.locator("#end-slider").dispatchEvent("change");
  await page.locator("#cw").click();
  check(
    (await page.locator("#distance").textContent()) !== "Incomplete",
    "arbitrary slider endpoints restore a contiguous section",
  );
  const water = page.locator("input[data-kind=water]");
  await water.uncheck();
  check(
    (await page.locator(".poi-marker.water").count()) === 0,
    "waypoint layer toggles map markers",
  );
  await water.check();
  await page.locator("#panel-close").click();
  await page.locator("#fit").click();
  const marker = page.locator(".route-marker.end"),
    box = await marker.boundingBox();
  const before = await page.locator("#end-position").textContent();
  if (box) {
    await page.mouse.move(box.x + 15, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 45, { steps: 8 });
    await page.mouse.up();
    check(
      (await page.locator("#end-position").textContent()) !== before,
      "dragging an endpoint snaps to a changed trail coordinate",
    );
  }
  await page.locator("#locate").click();
  check(
    (await page.evaluate(() => window.__gpsCalls)) === 1,
    "Locate Me makes exactly one GPS request",
  );
  await page.locator("#fit").click();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent !== "—",
  );
  check(
    (await page.evaluate(() => window.__gpsCalls)) === 0 &&
      (await page.locator("#last-location").textContent()).includes("Last fix"),
    "stored location displays without activating GPS",
  );
  await page.locator("#offline-open").click();
  await page.locator("#download").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#offline-label").textContent.includes("verified"),
    null,
    { timeout: 30000 },
  );
  check(
    (await page.locator("#offline-status").textContent()).includes(
      "files verified",
    ),
    "download verifies every local resource",
  );
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#distance").textContent !== "—",
  );
  await page.locator("#offline-open").click();
  await page.locator("#verify").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#offline-status")
      .textContent.includes("files verified"),
  );
  check(true, "offline relaunch and local re-verification succeed");
  await page.evaluate(async () => {
    const cache = await caches.open("trt-v1-pack");
    const url = new URL("data/route-v1.json", location.href);
    await cache.put(url, new Response("corrupt", { status: 200 }));
  });
  await page.locator("#verify").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#offline-status")
      .textContent.includes("Verification failed"),
  );
  check(
    !(await page.locator("#offline-label").textContent()).includes("verified"),
    "corrupt cached data revokes verified status",
  );
  check(errors.length === 0, "no uncaught browser errors");
  check(external.length === 0, "no external map, font, or data requests");
  await context.close();
  const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    dp = await desktop.newPage();
  await dp.goto(origin + "/");
  await dp.waitForFunction(
    () => document.querySelector("#distance").textContent === "20.0",
  );
  check(
    await dp.locator("#section-panel").isVisible(),
    "desktop layout and root hosting initialize",
  );
  await desktop.close();
  console.log(`${checks} browser checks passed.`);
} finally {
  await browser.close();
}
