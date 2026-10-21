import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist"),
  port = Number(process.env.PORT || 4173),
  host = process.env.HOST || "0.0.0.0";
try {
  await stat(path.join(root, "index.html"));
} catch {
  console.error(
    "Preview build missing. Run npm run dev (builds automatically).",
  );
  process.exit(1);
}
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const relative = pathname.replace(
        /^\/tahoe-rim-trail-companion(?=\/|$)/,
        "",
      );
      const file = path.resolve(
        root,
        "." + relative + (relative.endsWith("/") ? "index.html" : ""),
      );
      if (!file.startsWith(root + path.sep)) throw Error();
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .on("error", (error) => {
    console.error(
      `Preview could not listen on ${host}:${port}: ${error.message}`,
    );
    process.exit(1);
  })
  .listen(port, host, () =>
    console.log(
      `Tahoe Rim Trail v2 listening on ${host}:${port}\nOpen http://localhost:${port}/tahoe-rim-trail-companion/\nFor a remote cloud workspace, forward port ${port} to the Web preview; desktop localhost alone does not reach this server.`,
    ),
  );
