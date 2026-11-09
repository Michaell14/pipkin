// Rendering: one flat colour per pipkin, a silhouette made of body, ears and feet, ink eyes.
// Static output is plain shapes. Animated output wraps each moving part in a pivot group.
import { buildScene, bodyPaths, fmt } from "./geometry.js";
import { palette, groupPalette } from "./color.js";
import { rnd } from "./hash.js";
import { MOTION_CSS } from "./motion.js";

/** Eye states. "neutral" uses the kit's own eyes; the rest are expressions you can switch to. */
export const MOODS = Object.freeze(["neutral", "happy", "sleepy", "grumpy", "worried", "excited", "determined", "smug"]);
const MOOD_EYES = {
  happy: ["happy"],
  sleepy: ["line"],
  grumpy: ["lid", -0.05, 0.5],
  worried: ["lid", -0.35, -0.45],
  excited: ["big"],
  determined: ["lid", -0.3, 0.3],
  smug: ["lid", 0.08, 0.12],
};
const BACKGROUNDS = ["circle", "squircle", "square"];
const INSET = { circle: 0.8, squircle: 0.86, square: 0.9 };
const MAX_SCALE = 30; // group units → viewBox units, so an earless round kit is 60 wide
const FRAME = 88; // the kit fits in an 88 × 88 box centred in the 100 × 100 viewBox
const SEAM = 1; // half-width of the gap between fused members

// How far each ear reaches from its base, and half its width, in face radii (for framing).
const EAR_REACH = { cat: 0.53, fox: 0.69, bear: 0.36, mouse: 0.52, bunny: 0.9 };
const EAR_HALF = { cat: 0.33, fox: 0.37, bear: 0.28, mouse: 0.38, bunny: 0.16 };

// Ears are drawn in local space: base at the origin, pointing up.
function earShape(species, u, fill) {
  switch (species) {
    case "cat":
    case "fox": {
      const h = species === "fox" ? 0.62 : 0.46;
      const w = species === "fox" ? 0.3 : 0.26;
      return `<path d="M${fmt(-w * u)} ${fmt(0.14 * u)}L0 ${fmt(-h * u)}L${fmt(w * u)} ${fmt(0.14 * u)}Z" fill="${fill}" stroke="${fill}" stroke-width="${fmt(0.14 * u)}" stroke-linejoin="round"/>`;
    }
    case "bear":
      return `<circle cy="${fmt(-0.08 * u)}" r="${fmt(0.28 * u)}" fill="${fill}"/>`;
    case "mouse":
      return `<circle cy="${fmt(-0.14 * u)}" r="${fmt(0.38 * u)}" fill="${fill}"/>`;
    case "bunny":
      return `<ellipse cy="${fmt(-0.42 * u)}" rx="${fmt(0.16 * u)}" ry="${fmt(0.48 * u)}" fill="${fill}"/>`;
    default:
      return "";
  }
}

// Eyes are drawn in local space, centred on the origin.
function eyeShape(kind, r, ink, side, lid) {
  switch (kind) {
    case "big":
      return `<circle r="${fmt(r * 1.22)}" fill="${ink}"/>`;
    case "wide":
      return `<ellipse rx="${fmt(r * 1.18)}" ry="${fmt(r * 0.78)}" fill="${ink}"/>`;
    case "happy":
      return `<path d="M${fmt(-r)} ${fmt(r * 0.35)}Q0 ${fmt(-r * 1.15)} ${fmt(r)} ${fmt(r * 0.35)}" fill="none" stroke="${ink}" stroke-width="${fmt(r * 0.62)}" stroke-linecap="round"/>`;
    case "line":
      return `<path d="M${fmt(-r)} 0H${fmt(r)}" stroke="${ink}" stroke-width="${fmt(r * 0.62)}" stroke-linecap="round"/>`;
    case "lid":
      return lidEye(r * 1.12, lid[0], lid[1], side, ink);
    default:
      return `<circle r="${fmt(r)}" fill="${ink}"/>`;
  }
}

// A round eye with its top cut off by a lid. tilt > 0 lowers the corner nearest the nose.
function lidEye(r, off, tilt, side, ink) {
  const k = Math.tan(tilt);
  const keep = ([x, y]) => y - (off * r + k * x * -side);
  const ring = Array.from({ length: 28 }, (_, i) => [Math.cos((i / 28) * Math.PI * 2) * r, Math.sin((i / 28) * Math.PI * 2) * r]);
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ka = keep(a);
    const kb = keep(b);
    if (ka >= 0) out.push(a);
    if (ka >= 0 !== kb >= 0) {
      const t = ka / (ka - kb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.length > 2 ? `<path d="M${out.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z" fill="${ink}"/>` : "";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SQUIRCLE = "M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z";

function check(options) {
  const o = options ?? {};
  if (o.mood != null && !MOODS.includes(o.mood)) throw new TypeError(`pipkin: mood must be one of ${MOODS.join(", ")}`);
  if (o.background != null && o.background !== false && !BACKGROUNDS.includes(o.background))
    throw new TypeError(`pipkin: background must be ${BACKGROUNDS.join(", ")} or false`);
  if (o.animate != null && o.animate !== false && o.animate !== true && o.animate !== "hover") throw new TypeError(`pipkin: animate must be true, false or "hover"`);
  if (o.size != null && !(Number(o.size) > 0)) throw new TypeError("pipkin: size must be a positive number");
  return o;
}

/** Render one or more genomes (already de-duplicated and sorted) as one SVG string. */
export function draw(list, options) {
  const o = check(options);
  const sc = buildScene(list);
  const n = sc.n;
  const cols = list.map((g) => palette(g.genes));
  const ears = [];
  const feet = [];
  sc.members.forEach((m, i) => {
    const species = list[i].genes.species;
    const A = sc.anchors[i];
    const u = m.face.r;
    if (species !== "none")
      for (const [side, a] of [["l", A.earL], ["r", A.earR]]) if (a.exposed) ears.push({ i, side, x: a.x, y: a.y, ang: species === "bunny" ? a.ang * 0.45 : a.ang, u, species });
    for (const a of [A.footL, A.footR]) if (a.exposed) feet.push({ i, x: a.x, y: a.y, u });
  });

  // Frame the body, ears and feet together.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x, y) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const b of sc.balls) {
    grow(b.x - b.r * 1.07, b.y - b.r * 1.07);
    grow(b.x + b.r * 1.07, b.y + b.r * 1.07);
  }
  for (const e of ears) {
    const dx = Math.sin(e.ang);
    const dy = -Math.cos(e.ang);
    const reach = EAR_REACH[e.species] * e.u;
    const half = EAR_HALF[e.species] * e.u;
    for (const s of [-1, 1]) grow(e.x + dx * reach - dy * half * s, e.y + dy * reach + dx * half * s);
  }
  for (const f of feet) {
    grow(f.x - 0.2 * f.u, f.y + 0.12 * f.u);
    grow(f.x + 0.2 * f.u, f.y + 0.12 * f.u);
  }
  const S = Math.min(MAX_SCALE, FRAME / Math.max(x1 - x0, y1 - y0));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const X = (x) => 50 + (x - cx) * S;
  const Y = (y) => 50 + (y - cy) * S;

  const vb = sc.balls.map((b) => ({ x: X(b.x), y: Y(b.y), r: b.r * S, m: b.m }));
  const { outline, patches } = bodyPaths(vb, n, SEAM);
  const animate = o.animate === true || o.animate === "hover";
  const motion = (key, lo, hi) => (lo + (hi - lo) * rnd(sc.gid, "motion." + key)).toFixed(2);
  const memberDelay = (i, key, span) => `-${(span * rnd(list[i].id, "motion." + key)).toFixed(2)}s`;

  // Parts
  let partsFeet = "";
  for (const f of feet) partsFeet += `<ellipse cx="${fmt(X(f.x))}" cy="${fmt(Y(f.y - 0.02 * f.u))}" rx="${fmt(0.19 * f.u * S)}" ry="${fmt(0.12 * f.u * S)}" fill="${cols[f.i].body}"/>`;
  let partsEars = "";
  for (const e of ears) {
    const shape = earShape(e.species, e.u * S, cols[e.i].body);
    const place = `translate(${fmt(X(e.x))} ${fmt(Y(e.y))}) rotate(${fmt((e.ang * 180) / Math.PI)})`;
    if (animate) {
      const style = n > 1 ? ` style="--pipkin-twitch-delay:${memberDelay(e.i, "twitch", 10)}"` : "";
      partsEars += `<g transform="${place}"><g class="pipkin-ear pipkin-ear-${e.side}"${style}>${shape}</g></g>`;
    } else partsEars += `<g transform="${place}">${shape}</g>`;
  }
  const body = n === 1 ? `<path d="${outline}" fill="${cols[0].body}"/>` : patches.map((d, i) => `<path d="${d}" fill="${cols[i].body}" fill-rule="evenodd"/>`).join("");

  let partsEyes = "";
  const eye = (i, x, y, r, side) => {
    const g = list[i].genes;
    const mood = o.mood && o.mood !== "neutral" ? MOOD_EYES[o.mood] : [g.eyes];
    const shape = eyeShape(mood[0], r * S, cols[i].ink, side, [mood[1], mood[2]]);
    const place = `translate(${fmt(X(x))} ${fmt(Y(y))})`;
    if (!animate) return `<g transform="${place}">${shape}</g>`;
    const style = n > 1 ? ` style="--pipkin-blink-delay:${memberDelay(i, "blink", 6)}"` : "";
    return `<g transform="${place}"><g class="pipkin-eye"${style}>${shape}</g></g>`;
  };
  if (n === 1) {
    const f = sc.members[0].face;
    const g = list[0].genes;
    const r = f.r * 0.115;
    const gap = f.r * (0.27 + 0.08 * g.eyeGap);
    const ey = f.y + f.r * (0.04 + 0.08 * g.eyeY);
    partsEyes = eye(0, f.x - gap, ey, r, -1) + eye(0, f.x + gap, ey, r, 1);
  } else {
    const gx = sc.members.reduce((a, m) => a + m.lobe.x, 0) / n;
    const gy = sc.members.reduce((a, m) => a + m.lobe.y, 0) / n;
    const pull = n <= 4 ? 0.32 : 0.18;
    for (const m of sc.members) {
      const f = m.face;
      const x = f.x + (gx - f.x) * pull;
      partsEyes += eye(m.i, x, f.y + (gy - f.y) * pull + f.r * 0.04, f.r * 0.15, x < gx ? -1 : 1);
    }
  }

  // Assemble
  const tint = n === 1 ? cols[0].tint : groupPalette(list.map((g) => g.genes.hue)).tint;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"`;
  if (o.size) svg += ` width="${Number(o.size)}" height="${Number(o.size)}"`;
  if (animate) {
    svg += ` class="pipkin${o.animate === "hover" ? " pipkin-hover" : ""}"`;
    svg += ` style="--pipkin-breathe:${motion("breathe", 3.2, 4.4)}s;--pipkin-bob:${motion("bob", 3.8, 5)}s;--pipkin-delay:-${motion("delay", 0, 4)}s;--pipkin-blink:${motion("blink", 3.6, 6.4)}s;--pipkin-blink-delay:-${motion("blinkd", 0, 6)}s;--pipkin-twitch:${motion("twitch", 6, 11)}s;--pipkin-twitch-delay:-${motion("twitchd", 0, 10)}s"`;
  }
  svg += o.title ? ` role="img"><title>${esc(o.title)}</title>` : ` aria-hidden="true">`;
  if (animate && o.embedMotion) svg += `<style>${MOTION_CSS}</style>`;
  const bg = o.background || null;
  if (bg === "circle") svg += `<circle cx="50" cy="50" r="50" fill="${tint}"/>`;
  else if (bg === "squircle") svg += `<path d="${SQUIRCLE}" fill="${tint}"/>`;
  else if (bg === "square") svg += `<rect width="100" height="100" fill="${tint}"/>`;
  let inner = partsFeet + partsEars + body + partsEyes;
  if (animate) {
    const px = 50;
    const py = fmt(Math.min(100, Math.max(...vb.map((b) => b.y + b.r))));
    inner = `<g class="pipkin-bob"><g transform="translate(${px} ${py})"><g class="pipkin-breathe"><g transform="translate(-${px} -${py})">${inner}</g></g></g></g>`;
  }
  if (bg) inner = `<g transform="translate(50 50) scale(${INSET[bg]}) translate(-50 -50)">${inner}</g>`;
  return svg + inner + "</svg>";
}
