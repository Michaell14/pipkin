import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pipkin, fuse, breed, genome, describe, pipkinUri, fuseUri, MOODS, MOTION_CSS, TRAITS, share, fingerprint, MAX_MEMBERS } from "../src/index.js";
import { palette, contrast } from "../src/color.js";
import { cases } from "./cases.mjs";

const names = (n, prefix = "user") => Array.from({ length: n }, (_, i) => `${prefix}${i}@example.com`);

test("the same name always draws the same pipkin", () => {
  for (const n of names(50)) assert.equal(pipkin(n), pipkin(n));
});

test("names are normalised before hashing", () => {
  assert.equal(pipkin("  Maya@ACME.co "), pipkin("maya@acme.co"));
  assert.equal(pipkin("café"), pipkin("café"));
  assert.equal(pipkin("ana  maria"), pipkin("ana maria"));
});

test("golden renders are unchanged", () => {
  const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(golden).sort(), Object.keys(cases).sort());
  for (const [key, render] of Object.entries(cases)) assert.equal(fingerprint(render()), golden[key], key);
});

test("breeding ignores parent order and numbers siblings", () => {
  const a = breed("maya", "theo", { child: 2 });
  assert.equal(a, breed("theo", "maya", { child: 2 }));
  assert.equal(a.id, "maya×theo#2");
  assert.notEqual(pipkin(breed("maya", "theo", { child: 0 })), pipkin(breed("maya", "theo", { child: 1 })));
});

test("a lineage string is a name", () => {
  assert.equal(pipkin("maya×theo#1"), pipkin(breed("maya", "theo", { child: 1 })));
  assert.equal(pipkin("theo×maya#1"), pipkin("maya×theo#1"));
  const grandchild = breed(breed("maya", "theo", { child: 1 }), "zoe");
  assert.equal(grandchild.id, "(maya×theo#1)×zoe#0");
  assert.equal(pipkin(grandchild.id), pipkin(grandchild));
  assert.equal(grandchild.gen, 2);
});

test("children record where each trait came from", () => {
  const c = breed("maya", "theo");
  for (const key of Object.keys(TRAITS)) assert.ok(["maya", "theo", "both", "new"].includes(c.from[key]), key);
  assert.ok(["maya", "theo", "mix"].includes(c.from.hue));
});

test("fusing ignores order and duplicates", () => {
  assert.equal(fuse(["maya", "theo", "iris"]), fuse(["iris", "maya", "theo", "maya"]));
  assert.equal(fuse(["maya"]), pipkin("maya"));
  // Past the limit, the first members in sorted order are kept, so the result is still order-free.
  assert.equal(fuse(names(20)), fuse([...names(20)].sort().slice(0, MAX_MEMBERS)));
  assert.equal(fuse(names(20)), fuse([...names(20)].reverse()));
  assert.throws(() => fuse([]), TypeError);
});

test("a draw is not affected by the draws before it", () => {
  // The renderer reuses its working buffers, so the same draw must come out the same whatever ran last.
  const solo = names(12, "solo");
  const sizes = [2, 5, 9];
  const first = solo.map((n) => pipkin(n));
  const groups = sizes.map((n) => fuse(names(n, "mix")));
  for (const n of [9, 3, 6]) fuse(names(n, "other"));
  assert.deepEqual([...solo].reverse().map((n) => pipkin(n)).reverse(), first);
  assert.deepEqual([...sizes].reverse().map((n) => fuse(names(n, "mix"))).reverse(), groups);
  assert.throws(() => pipkin("maya", { mood: "hangry" }), TypeError);
  assert.deepEqual(solo.map((n) => pipkin(n)), first);
});

test("eyes clear 6.8:1 against every body colour", () => {
  let worst = Infinity;
  for (let hue = 0; hue < 360; hue += 1)
    for (const tone of [0, 0.5, 1])
      for (const chroma of [0, 0.5, 1]) {
        const p = palette({ hue, tone, chroma });
        worst = Math.min(worst, contrast(p.body, p.ink));
      }
  assert.ok(worst >= 6.8, `worst contrast ${worst.toFixed(2)}`);
});

test("output is well formed", () => {
  const bad = /NaN|undefined|Infinity/;
  for (const n of names(800)) {
    const svg = pipkin(n);
    assert.ok(!bad.test(svg), n);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 100 100"/);
    for (const [, d] of svg.matchAll(/ d="([^"]+)"/g)) assert.match(d, /^M/);
  }
  for (let i = 0; i < 120; i++) {
    const svg = fuse(names(2 + (i % 8), `g${i}-`));
    assert.ok(!bad.test(svg), `group ${i}`);
  }
});

test("animated output is structured for motion, static output is not", () => {
  const still = pipkin("omar");
  assert.ok(!still.includes("pipkin-"));
  const moving = pipkin("omar", { animate: true });
  for (const part of ['class="pipkin"', "pipkin-bob", "pipkin-breathe", "pipkin-eye", "--pipkin-blink", "--pipkin-twitch"]) assert.ok(moving.includes(part), part);
  assert.ok(!moving.includes("<style>"));
  assert.ok(pipkin("omar", { animate: "hover" }).includes('class="pipkin pipkin-hover"'));
  assert.ok(pipkin("omar", { animate: true, embedMotion: true }).includes(`<style>${MOTION_CSS}</style>`));
  const crowd = new Set(names(30).map((n) => pipkin(n, { animate: true }).match(/--pipkin-blink:([\d.]+)s/)[1]));
  assert.ok(crowd.size > 20, "blink timing varies between pipkins");
});

test("motion.css matches the embedded copy", () => {
  const css = readFileSync(new URL("../src/motion.css", import.meta.url), "utf8");
  assert.ok(css.endsWith(MOTION_CSS));
});

test("every mood renders, and moods change dot eyes", () => {
  const dotty = names(200).find((n) => genome(n).genes.eyes === "dot");
  const neutral = pipkin(dotty);
  for (const mood of MOODS) {
    const svg = pipkin(dotty, { mood });
    if (mood === "neutral") assert.equal(svg, neutral);
    else assert.notEqual(svg, neutral, mood);
  }
});

test("bad options throw", () => {
  assert.throws(() => pipkin("maya", { mood: "hangry" }), TypeError);
  assert.throws(() => pipkin("maya", { background: "hexagon" }), TypeError);
  assert.throws(() => pipkin("maya", { animate: "always" }), TypeError);
  assert.throws(() => pipkin("maya", { size: -4 }), TypeError);
});

test("titles are escaped and make the SVG an image", () => {
  const svg = pipkin("maya", { title: 'Maya <"admin">' });
  assert.ok(svg.includes('role="img"><title>Maya &lt;&quot;admin&quot;&gt;</title>'));
  assert.ok(pipkin("maya").includes('aria-hidden="true"'));
});

test("traits appear as often as their weights say", () => {
  const sample = names(20000, "dist");
  for (const key of Object.keys(TRAITS)) {
    const counts = {};
    for (const n of sample) {
      const v = genome(n).genes[key];
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const value of TRAITS[key].values) {
      const seen = (counts[value] ?? 0) / sample.length;
      assert.ok(Math.abs(seen - share(key, value)) < 0.015, `${key}=${value}: ${seen.toFixed(3)} vs ${share(key, value).toFixed(3)}`);
    }
  }
});

test("output stays small", () => {
  const sample = names(300, "size");
  const avg = sample.reduce((a, n) => a + pipkin(n).length, 0) / sample.length;
  assert.ok(avg < 2600, `average ${avg.toFixed(0)} bytes`);
  assert.ok(fuse(names(9, "big")).length < 12000);
});

test("helpers", () => {
  assert.match(describe("maya"), /^[a-z]+ (cat|fox|bear|mouse|bunny|pipkin) with [a-z]+ eyes$/);
  assert.ok(pipkinUri("maya").startsWith("data:image/svg+xml;utf8,%3Csvg"));
  assert.ok(fuseUri(["maya", "theo"]).startsWith("data:image/svg+xml;utf8,"));
  assert.equal(genome("Maya"), genome("maya"));
});

test("the dist bundle draws exactly what the source draws", async (t) => {
  const { existsSync } = await import("node:fs");
  const url = new URL("../dist/pipkins.js", import.meta.url);
  if (!existsSync(url)) return t.skip("run npm run build first");
  const dist = await import(url.href);
  for (const n of ["maya", "theo", "日本語", "maya×theo#1"]) assert.equal(dist.pipkin(n), pipkin(n));
  assert.equal(dist.fuse(["maya", "theo", "iris"], { animate: true }), fuse(["maya", "theo", "iris"], { animate: true }));
  assert.equal(dist.VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});
