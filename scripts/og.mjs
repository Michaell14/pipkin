// Render the share preview: docs/og/pipkins.mp4 (og:video) and docs/og/pipkins.png (og:image).
// The card replays the site's load animation: a fused pipkin bursts, the crowd pops up out of
// its squares and the title card rises. Every frame is stepped exactly, so the loop is seamless.
// Needs Playwright with Chromium (npx playwright install chromium) and ffmpeg on the PATH.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { pipkin, fuse, MOTION_CSS } from "../src/index.js";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("npm run og needs Playwright: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const out = new URL("../docs/og/", import.meta.url);
const W = 1200;
const H = 630;
const FPS = 30;
const LOOP = 5000; // ms
const STILL = 3000; // ms into the loop: everyone is up and the card is in

const SAMPLES = ["theo", "omar", "lena", "juno", "zoe", "basil", "priya", "iris", "odin", "ines", "kofi", "maya", "ava", "rosa", "ezra", "mila", "otto", "sana", "leo", "ruby", "finn", "hugo", "nora", "tara", "max", "idris", "cleo", "felix"];
const FRIENDS = ["Michael", "Hemosoo", "Sam", "David", "Dennis", "Dominic", "Allen", "Avery", "Fred", "Timothy"];
const FRIEND_SLOTS = [3, 7, 11, 14, 18, 21, 25, 29, 33, 36];

// An 11 x 6 grid; the card covers columns 3 to 9 and rows 2 to 5, the crowd fills the 38 cells around it.
const cells = [];
for (let r = 0; r < 6; r++) {
  for (let c = 0; c < 11; c++) {
    if (r >= 1 && r <= 4 && c >= 2 && c <= 8) continue;
    cells.push([c, r]);
  }
}
const rnd = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
const queue = [...SAMPLES];
const crowd = cells.map(([c, r], i) => {
  const friend = FRIEND_SLOTS.indexOf(i);
  const name = friend >= 0 ? FRIENDS[friend] : queue.shift();
  const delay = Math.round(Math.hypot(c - 5, (r - 2.5) * 0.96) * 55 + rnd(i) * 150);
  return `<div class="cell"><div class="pk" style="animation-delay:${delay}ms">${pipkin(name, { animate: true })}</div></div>`;
});

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gabarito:wght@700;800&family=DM+Mono&display=block">
<style>${MOTION_CSS}</style>
<style>
html, body { margin: 0; }
body { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #f3f5fb; color: #141a33; font-family: Gabarito, sans-serif; -webkit-font-smoothing: antialiased; }
svg { display: block; width: 100%; height: 100%; }
.grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); }
.cell { display: grid; place-items: center; overflow: hidden; }
.pk { width: 82px; height: 82px; animation: peek ${LOOP}ms ease-out infinite; }
.card { grid-column: 3 / 10; grid-row: 2 / 6; margin: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; border-radius: 32px; background: #fff; box-shadow: 0 30px 60px -28px rgba(20, 26, 51, 0.35), 0 0 0 1px rgba(20, 26, 51, 0.06); animation: card ${LOOP}ms ease-out infinite; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 76px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
.logo { width: 72px; height: 72px; }
.line { font-size: 42px; font-weight: 700; letter-spacing: -0.02em; }
.cmd { font-family: "DM Mono", monospace; font-size: 22px; color: #545b73; }
.blob { position: absolute; left: 450px; top: 165px; width: 300px; height: 300px; animation: blob ${LOOP}ms ease-out infinite; }
@keyframes peek { 0%, 22% { transform: translateY(135%); opacity: 1; } 31% { transform: translateY(-6%); } 35% { transform: translateY(0); } 90% { transform: translateY(0); opacity: 1; } 97%, 100% { transform: translateY(0); opacity: 0; } }
@keyframes blob { 0% { transform: scale(0); opacity: 1; } 6% { transform: scale(1); } 13% { transform: scale(1.04); } 18% { transform: scale(1); } 21% { transform: scale(0.92); opacity: 1; } 25% { transform: scale(1.35); opacity: 0.55; } 28%, 100% { transform: scale(1.7); opacity: 0; } }
@keyframes card { 0%, 27% { opacity: 0; transform: translateY(18px); } 35%, 92% { opacity: 1; transform: none; } 98%, 100% { opacity: 0; transform: none; } }
</style></head><body>
<div class="grid">
<div class="card"><div class="brand"><span class="logo">${pipkin("maya")}</span>pipkins</div><div class="line">There's one for everyone.</div><div class="cmd">npm i pipkins</div></div>
${crowd.join("\n")}
</div>
<div class="blob">${fuse(FRIENDS, { animate: true })}</div>
</body></html>`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
const seek = (t) => page.evaluate((t) => document.getAnimations().forEach((a) => (a.currentTime = t)), t);

const video = new URL("pipkins.mp4", out).pathname;
const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", video], { stdio: ["pipe", "inherit", "inherit"] });
const encoded = new Promise((resolve, reject) => {
  ffmpeg.on("error", reject);
  ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
});
const frames = Math.round((LOOP / 1000) * FPS);
for (let f = 0; f < frames; f++) {
  await seek((f * 1000) / FPS);
  const png = await page.screenshot({ type: "png" });
  if (!ffmpeg.stdin.write(png)) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
}
ffmpeg.stdin.end();
await encoded;

const still = new URL("pipkins.png", out).pathname;
await seek(STILL);
await page.screenshot({ path: still, type: "png" });
await browser.close();

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`docs/og/pipkins.mp4  ${frames} frames, ${kb(video)} KB`);
console.log(`docs/og/pipkins.png  ${kb(still)} KB`);
