import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const serverDir = resolve(dist, "server");

const [html, css, js] = await Promise.all([
  readFile(resolve(root, "src/index.html"), "utf8"),
  readFile(resolve(root, "src/styles.css"), "utf8"),
  readFile(resolve(root, "src/app.js"), "utf8"),
]);

const workerSource = `const assets = new Map(${JSON.stringify([
  ["/", { body: html, type: "text/html; charset=utf-8" }],
  ["/index.html", { body: html, type: "text/html; charset=utf-8" }],
  ["/styles.css", { body: css, type: "text/css; charset=utf-8" }],
  ["/app.js", { body: js, type: "text/javascript; charset=utf-8" }],
])});

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...securityHeaders },
  });
}

async function proxyEtfs() {
  try {
    const upstream = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", {
      headers: {
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://finance.naver.com/sise/etf.naver",
        "User-Agent": "Mozilla/5.0 (compatible; ETFInsight/1.0)",
      },
      cf: { cacheTtl: 15, cacheEverything: true },
    });

    if (!upstream.ok) {
      return jsonResponse({ error: "upstream_error", status: upstream.status }, 502);
    }

    const headers = new Headers({
      "Content-Type": "text/plain; charset=euc-kr",
      "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
      ...securityHeaders,
    });
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return jsonResponse({ error: "network_error", message: String(error?.message || error) }, 502);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/etfs") {
      if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
      return proxyEtfs();
    }

    const asset = assets.get(url.pathname);
    if (asset) {
      return new Response(asset.body, {
        headers: {
          "Content-Type": asset.type,
          "Cache-Control": url.pathname === "/" || url.pathname === "/index.html" ? "no-cache" : "public, max-age=300",
          ...securityHeaders,
        },
      });
    }

    return new Response("Not Found", { status: 404, headers: securityHeaders });
  },
};
`;

await rm(dist, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await writeFile(resolve(serverDir, "index.js"), workerSource, "utf8");
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, ".openai/hosting.json"), await readFile(resolve(root, ".openai/hosting.json"), "utf8"), "utf8");

console.log(`Built worker: ${resolve(serverDir, "index.js")}`);
