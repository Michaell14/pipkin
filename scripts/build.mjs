// Build dist/pipkins.js (one ES module, no imports), docs/index.html (the docs page) and
// docs/examples.html (the examples page), each page with the library inlined so it runs anywhere
// as a single file.
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
const banner = `// pipkins ${version}: deterministic animal avatars that breed and fuse. MIT licence.\n`;
mkdirSync(new URL("dist/", root), { recursive: true });
const dist = `${banner}${body}\nexport { ${PUBLIC.join(", ")} };\n`;
writeFileSync(new URL("dist/pipkins.js", root), dist);
console.log(`dist/pipkins.js     ${(dist.length / 1024).toFixed(1)} KB, ${(gzipSync(dist).length / 1024).toFixed(1)} KB gzipped`);

// Minified copy for CDNs, if esbuild is installed (it is a dev dependency only).
let shipped = dist;
try {
  const { transform } = await import("esbuild");
  const { code } = await transform(dist, { minify: true, format: "esm", target: "es2020" });
  writeFileSync(new URL("dist/pipkins.min.js", root), banner + code);
  shipped = banner + code;
  console.log(`dist/pipkins.min.js ${(shipped.length / 1024).toFixed(1)} KB, ${(gzipSync(shipped).length / 1024).toFixed(1)} KB gzipped`);
} catch {
  console.log("esbuild not installed: skipped dist/pipkins.min.js (run npm install)");
}

// Docs page: inline the library (without the export line) into the page's module script.
// motion.css is generated from motion.js so the two can never drift apart.
const { MOTION_CSS } = await import(new URL("src/motion.js", root).href);
writeFileSync(new URL("src/motion.css", root), "/* pipkins motion: idle life for animated pipkins. Load once per page. Generated from src/motion.js. */\n" + MOTION_CSS);

const inline = `${body}\nconst PIPKIN = { ${PUBLIC.join(", ")} };`;
const motionCss = read("src/motion.css");
// On Vercel the site sits at the root of its domain and the pages are served at clean URLs (see
// vercel.json). A link that ends in .html costs a redirect on every click there, so the pages link
// to each other, and to their fonts, from the root. Anywhere else those links stay relative and
// keep their file names, so the pages still work from a folder or any static host.
const rooted = Boolean(process.env.VERCEL);
const links = (html) =>
  rooted ? html.replace(/href="([\w-]+)\.html(#[\w-]*)?"/g, (_, page, hash = "") => `href="/${page === "index" ? "" : page}${hash}"`).replace(/href="fonts\//g, 'href="/fonts/') : html;
// The pages' fonts are the files in docs/fonts/ (the ones Google Fonts serves, with the same
// unicode ranges), so nothing is fetched from another origin before the first paint.
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF";
const FONTS = [
  ["Gabarito", "400 900", "gabarito-v9"],
  ["DM Mono", "400", "dm-mono-v16-400"],
  ["DM Mono", "500", "dm-mono-v16-500"],
];
const fontCss = FONTS.flatMap(([family, weight, file]) =>
  [["latin-ext", LATIN_EXT], ["latin", LATIN]].map(
    ([subset, range]) => `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(${rooted ? "/" : ""}fonts/${file}-${subset}.woff2) format("woff2"); unicode-range: ${range}; }`,
  ),
).join("\n");
// Share-preview tags need absolute URLs. On Vercel the production domain comes from its system
// environment variables; set SITE_URL (like https://example.com) to override. With neither, the
// tags fall back to root-relative paths.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = (process.env.SITE_URL || (vercel ? `https://${vercel}` : "")).replace(/\/+$/, "");
const fill = (source) =>
  links(read(source))
    .replace(/__SITE__/g, site)
    .replace("/*PIPKIN-LIBRARY*/", () => inline)
    .replace("/*PIPKIN-FONTS*/", () => fontCss)
    .replace("/*PIPKIN-MOTION*/", () => motionCss)
    .replace(/__VERSION__/g, version)
    .replace(/__GZIP__/g, (gzipSync(shipped).length / 1024).toFixed(1));
const out = fill("docs/page.html");
writeFileSync(new URL("docs/index.html", root), out);
// The examples page is built the same way, from its own source.
const examples = fill("docs/examples-page.html");
writeFileSync(new URL("docs/examples.html", root), examples);
console.log(`docs/examples.html  ${(examples.length / 1024).toFixed(1)} KB`);
// The page is a full document; preview.html only adds the head tags when it is a fragment.
const head = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
writeFileSync(new URL("docs/preview.html", root), /^<!doctype/i.test(out) ? out : head + out);
console.log(`docs/index.html  ${(out.length / 1024).toFixed(1)} KB`);
