// Build dist/pipkin.js (one ES module, no imports) and docs/index.html (the docs page with the
// library inlined, so it runs anywhere as a single file).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const ORDER = ["hash", "genome", "color", "geometry", "motion", "render", "index"];
const PUBLIC = ["VERSION", "pipkin", "fuse", "pipkinUri", "fuseUri", "breed", "genome", "describe", "share", "TRAITS", "MOODS", "MOTION_CSS", "MAX_MEMBERS", "normalize", "fingerprint"];

let body = "";
for (const name of ORDER) {
  const src = read(`src/${name}.js`)
    .replace(/^import [^;]+;\n/gm, "")
    .replace(/^export \{[^}]*\};\n/gm, "")
    .replace(/^export /gm, "");
  body += `\n// ---- ${name}.js\n${src}`;
}
const version = JSON.parse(read("package.json")).version;
const banner = `// pipkin ${version}: deterministic animal avatars that breed and fuse. MIT licence.\n`;
mkdirSync(new URL("dist/", root), { recursive: true });
const dist = `${banner}${body}\nexport { ${PUBLIC.join(", ")} };\n`;
writeFileSync(new URL("dist/pipkin.js", root), dist);
console.log(`dist/pipkin.js      ${(dist.length / 1024).toFixed(1)} KB, ${(gzipSync(dist).length / 1024).toFixed(1)} KB gzipped`);

// Minified copy for CDNs, if esbuild is installed (it is a dev dependency only).
let shipped = dist;
try {
  const { transform } = await import("esbuild");
  const { code } = await transform(dist, { minify: true, format: "esm", target: "es2020" });
  writeFileSync(new URL("dist/pipkin.min.js", root), banner + code);
  shipped = banner + code;
  console.log(`dist/pipkin.min.js  ${(shipped.length / 1024).toFixed(1)} KB, ${(gzipSync(shipped).length / 1024).toFixed(1)} KB gzipped`);
} catch {
  console.log("esbuild not installed: skipped dist/pipkin.min.js (run npm install)");
}

// Docs page: inline the library (without the export line) into the page's module script.
// motion.css is generated from motion.js so the two can never drift apart.
const { MOTION_CSS } = await import(new URL("src/motion.js", root).href);
writeFileSync(new URL("src/motion.css", root), "/* pipkin motion: idle life for animated pipkins. Load once per page. Generated from src/motion.js. */\n" + MOTION_CSS);

const page = read("docs/page.html");
const inline = `${body}\nconst PIPKIN = { ${PUBLIC.join(", ")} };`;
const motionCss = read("src/motion.css");
// Share-preview tags need absolute URLs. On Vercel the production domain comes from its system
// environment variables; set SITE_URL (like https://example.com) to override. With neither, the
// tags fall back to root-relative paths.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = (process.env.SITE_URL || (vercel ? `https://${vercel}` : "")).replace(/\/+$/, "");
const out = page
  .replace(/__SITE__/g, site)
  .replace("/*PIPKIN-LIBRARY*/", () => inline)
  .replace("/*PIPKIN-MOTION*/", () => motionCss)
  .replace(/__VERSION__/g, version)
  .replace(/__GZIP__/g, (gzipSync(shipped).length / 1024).toFixed(1));
writeFileSync(new URL("docs/index.html", root), out);
// The page is a full document; preview.html only adds the head tags when it is a fragment.
const head = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
writeFileSync(new URL("docs/preview.html", root), /^<!doctype/i.test(out) ? out : head + out);
console.log(`docs/index.html  ${(out.length / 1024).toFixed(1)} KB`);
