export const PACK_CACHE = "trt-v1-pack";
const manifestURL = new URL("../offline-manifest-v1.json", import.meta.url);
const base = new URL("../", import.meta.url);
async function digest(response) {
  const bytes = await response.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    size: bytes.byteLength,
    hash: [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
  };
}
async function validate(response, resource) {
  if (!response || !response.ok) throw Error(`Missing file: ${resource.url}`);
  const actual = await digest(response);
  if (actual.size !== resource.bytes || actual.hash !== resource.sha256)
    throw Error(`Verification failed: ${resource.url}`);
}
export async function verifyPack(progress = () => {}) {
  if (!("caches" in window))
    throw Error("Offline storage is unavailable. Use Safari over HTTPS.");
  const cache = await caches.open(PACK_CACHE),
    stored = await cache.match(manifestURL);
  if (!stored)
    throw Error(
      "No verified pack on this device. Download before leaving service.",
    );
  const manifest = await stored.json();
  let done = 0;
  for (const resource of manifest.resources) {
    await validate(await cache.match(new URL(resource.url, base)), resource);
    progress(++done / manifest.resources.length);
  }
  return manifest;
}
export async function downloadPack(progress = () => {}) {
  if (!navigator.serviceWorker || !crypto.subtle)
    throw Error("Offline installation needs HTTPS and service worker support.");
  await navigator.serviceWorker.ready;
  const response = await fetch(manifestURL, { cache: "no-store" });
  if (!response.ok) throw Error("Cannot download the pack manifest.");
  const manifest = await response.clone().json();
  const name = "trt-v1-staging";
  await caches.delete(name);
  const staging = await caches.open(name);
  let done = 0;
  try {
    for (const resource of manifest.resources) {
      const url = new URL(resource.url, base),
        file = await fetch(url, { cache: "no-store" });
      await validate(file.clone(), resource);
      await staging.put(url, file);
      progress((++done / manifest.resources.length) * 0.8);
    }
    // Only publish the new manifest after every fetched resource passes its hash.
    const cache = await caches.open(PACK_CACHE);
    await cache.delete(manifestURL);
    for (const resource of manifest.resources) {
      const url = new URL(resource.url, base);
      await cache.put(url, await staging.match(url));
    }
    await cache.put(manifestURL, response);
    const verified = await verifyPack((p) => progress(0.8 + 0.2 * p));
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* Persistence is advisory on Safari. */
    }
    return verified;
  } finally {
    await caches.delete(name);
  }
}
