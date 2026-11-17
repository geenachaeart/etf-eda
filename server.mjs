import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const staticRoot = resolve(root, process.env.STATIC_DIR || "src");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/etfs") {
    try {
      const upstream = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", {
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://finance.naver.com/sise/etf.naver",
          "User-Agent": "Mozilla/5.0 (compatible; ETFInsight/1.0)",
        },
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.ok ? 200 : 502, {
        "Content-Type": "text/plain; charset=euc-kr",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(error?.message || error) }));
    }
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = resolve(staticRoot, relative);
  if (!file.startsWith(staticRoot)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ETF Insight local preview: http://127.0.0.1:${port}`);
});
