import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const version = JSON.parse(await readFile("package.json")).version.split(
  ".",
)[0];
await mkdir("releases", { recursive: true });
execFileSync("tar", [
  "-czf",
  `releases/tahoe-rim-trail-companion-v${version}.tar.gz`,
  "-C",
  "dist",
  ".",
]);
console.log(`releases/tahoe-rim-trail-companion-v${version}.tar.gz`);
