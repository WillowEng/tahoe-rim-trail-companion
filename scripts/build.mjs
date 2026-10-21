import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  out = new URL("../dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of [
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "sw.js",
  "icon-v1.svg",
  "icon-192-v1.png",
  "icon-512-v1.png",
  "apple-touch-icon-v1.png",
  "src",
  "vendor",
])
  await cp(new URL(file, root), new URL(file, out), { recursive: true });
await mkdir(new URL("docs/", out));
for (const file of await readdir(new URL("docs/", root)))
  if (file.endsWith(".md") || file.endsWith(".json"))
    await cp(new URL("docs/" + file, root), new URL("docs/" + file, out));
await mkdir(new URL("data/", out));
for (const file of await readdir(new URL("data/", root)))
  if (file.endsWith(".json") || file.endsWith(".geojson") || file === "terrain")
    await cp(new URL("data/" + file, root), new URL("data/" + file, out), {
      recursive: true,
    });
const resources = [];
async function scan(dir = "") {
  for (const e of await readdir(new URL(dir, out), { withFileTypes: true })) {
    const path = dir + e.name;
    if (e.isDirectory()) await scan(path + "/");
    else if (path !== "sw.js") {
      const bytes = await readFile(new URL(path, out));
      resources.push({
        url: path,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
await scan();
await writeFile(
  new URL("offline-manifest-v2.json", out),
  JSON.stringify({ version: "v2", resources }, null, 2),
);
console.log(
  `Built v2: ${resources.length} verifiable offline resources, ${(resources.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)} MiB`,
);
