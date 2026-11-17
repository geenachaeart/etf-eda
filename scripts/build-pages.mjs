import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src");
const pages = resolve(root, "docs");

await rm(pages, { recursive: true, force: true });
await mkdir(pages, { recursive: true });
await Promise.all([
  copyFile(resolve(source, "index.html"), resolve(pages, "index.html")),
  copyFile(resolve(source, "styles.css"), resolve(pages, "styles.css")),
  copyFile(resolve(source, "app.js"), resolve(pages, "app.js")),
  writeFile(resolve(pages, ".nojekyll"), "", "utf8"),
]);

console.log(`Built GitHub Pages: ${pages}`);
