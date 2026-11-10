// Render the demo videos: docs/demo/<cut>.mp4 and a poster, docs/demo/<cut>.png.
//
//   node scripts/demo.mjs                 every cut
//   node scripts/demo.mjs tour pop        just these
//   node scripts/demo.mjs tour --stills=0.5,3,12.4 --out=/tmp/x   single frames instead of a video
//
// Each cut is one page, scripts/demo/<cut>.html, that lines up scenes from scripts/demo/scenes.js
// (the timeline kit under them is scripts/demo/kit.js). A page is a pure function of time, so the
// frames are stepped exactly and rendered by several tabs at once.
// Needs Playwright with Chromium and ffmpeg on the PATH, like `npm run og`.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("npm run demo needs Playwright: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const CUTS = ["tour", "code", "pop", "tour-pop", "pop-tour", "type-pop"];
const W = 1920;
const H = 1080;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const cuts = args.filter((a) => !a.startsWith("--"));
const FPS = Number(flag("fps", 60));
const JOBS = Number(flag("jobs", 4));
const SCALE = Number(flag("scale", 1));
const stills = flag("stills", "");
const outDir = flag("out", fileURLToPath(new URL("docs/demo/", root)));
// What the end card says. The package on npm is "pipkin".
const BRAND = flag("brand", "pipkin");
const INSTALL = flag("install", `npm i ${BRAND}`);

// The library as one script with no imports or exports, so the pages can reach its internals.
const library = ["hash", "genome", "color", "geometry", "motion", "render", "index"]
  .map((name) =>
    read(`src/${name}.js`)
      .replace(/^import [^;]+;\n/gm, "")
      .replace(/^export \{[^}]*\};\n/gm, "")
      .replace(/^export /gm, ""),
  )
  .join("\n");
const { MOTION_CSS } = await import(new URL("src/motion.js", root).href);
const gzip = (await import("node:zlib")).gzipSync(read("dist/pipkin.min.js")).length;

// Everything but the cut itself. The cut goes in once the fonts are loaded, because scenes measure text.
const shell = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gabarito:wght@400..900&family=DM+Mono:wght@400;500&display=block">
<style>${MOTION_CSS}</style>
<style>${read("scripts/demo/kit.css")}</style>
<style>${read("scripts/demo/scenes.css")}</style>
</head><body>
<script>const CFG = ${JSON.stringify({ brand: BRAND, install: INSTALL, kb: (gzip / 1024).toFixed(1) })};</script>
<script>${library}</script>
<script>${read("scripts/demo/kit.js")}</script>
<script>${read("scripts/demo/scenes.js")}</script>
</body></html>`;
const FACES = ["400 20px Gabarito", "600 20px Gabarito", "700 20px Gabarito", "800 20px Gabarito", "900 20px Gabarito", '400 20px "DM Mono"', '500 20px "DM Mono"'];

async function open(browser, cut) {
  const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  tab.on("pageerror", (e) => console.error("page error:", e.message));
  tab.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await tab.setContent(shell, { waitUntil: "networkidle" });
  await tab.evaluate((faces) => Promise.all(faces.map((f) => document.fonts.load(f, "Aa0 ×·"))), FACES);
  // Markup and styles go in as they are; scripts are re-created so that they run.
  await tab.evaluate((html) => {
    const holder = document.createElement("template");
    holder.innerHTML = html;
    for (const node of [...holder.content.children]) {
      if (node.tagName !== "SCRIPT") document.body.append(node);
      else document.body.append(Object.assign(document.createElement("script"), { textContent: node.textContent }));
    }
  }, read(`scripts/demo/${cut}.html`));
  await tab.evaluate(() => document.fonts.ready);
  return tab;
}
const shoot = async (tab, t, path) => {
  await tab.evaluate((t) => seek(t), t);
  await tab.screenshot({ path, type: "png" });
};

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const cut of cuts.length ? cuts : CUTS) {
  if (stills) {
    const tab = await open(browser, cut);
    for (const s of stills.split(",")) await shoot(tab, Number(s) * 1000, join(outDir, `${cut}-${Number(s).toFixed(2).padStart(5, "0")}.png`));
    await tab.close();
    continue;
  }
  const started = Date.now();
  const tabs = await Promise.all(Array.from({ length: JOBS }, () => open(browser, cut)));
  const duration = await tabs[0].evaluate(() => DURATION);
  const poster = await tabs[0].evaluate(() => POSTER);
  const frames = Math.round((duration / 1000) * FPS);
  const dir = mkdtempSync(join(tmpdir(), `pipkin-${cut}-`));
  const name = (f) => join(dir, `${String(f).padStart(5, "0")}.png`);
  await Promise.all(
    tabs.map(async (tab, j) => {
      const end = Math.round(((j + 1) * frames) / JOBS);
      for (let f = Math.round((j * frames) / JOBS); f < end; f++) await shoot(tab, (f * 1000) / FPS, name(f));
    }),
  );
  const video = join(outDir, `${cut}.mp4`);
  // Flat colour and fine edges: a low crf, and BT.709 tags so players show the page's colours.
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.png"), "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart", "-an", video],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  await shoot(tabs[0], poster, join(outDir, `${cut}.png`));
  await Promise.all(tabs.map((tab) => tab.close()));
  rmSync(dir, { recursive: true, force: true });
  console.log(`${cut}.mp4  ${(duration / 1000).toFixed(1)} s, ${frames} frames, ${(statSync(video).size / 1048576).toFixed(1)} MB, rendered in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();
