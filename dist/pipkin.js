// pipkin 0.1.0: deterministic animal avatars that breed and fuse. MIT licence.

// ---- hash.js
// Hashing. Every trait is addressed by (seed, key), so adding a trait later never
// moves the traits that already exist.

const utf8 = new TextEncoder();

/** 32-bit FNV-1a over UTF-8 bytes, finished with murmur3's fmix32 for avalanche. */
function hash32(str) {
  const bytes = utf8.encode(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) for this seed and key. */
const rnd = (seed, key) => hash32(seed + "\u0001" + key) / 4294967296;

/** 8 hex characters identifying a string, handy for tests and caches. */
const fingerprint = (str) => hash32(str).toString(16).padStart(8, "0");

/** NFC, trimmed, lower-cased, inner whitespace collapsed. "Maya@Acme.co " and "maya@acme.co" agree. */
function normalize(name) {
  return String(name ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ---- genome.js
// Genomes: what a name means as a kit, and how two kits make a third.

/** The categorical traits, with how often each value appears. Frozen within a major version. */
const TRAITS = Object.freeze({
  species: { values: ["cat", "fox", "bear", "mouse", "bunny", "none"], weights: [22, 16, 20, 14, 18, 10] },
  body: { values: ["round", "bean", "pear", "mochi", "peanut"], weights: [30, 16, 16, 22, 16] },
  eyes: { values: ["dot", "big", "wide", "happy", "line"], weights: [44, 18, 14, 12, 12] },
});

// Continuous genes in [0, 1). BLENDED ones mix between parents; SHAPED ones travel with the body.
const BLENDED = ["tone", "chroma", "size", "eyeGap", "eyeY"];
const SHAPED = ["p0", "p1", "p2", "p3"];
const MUTATION = 0.06;
const MEMO_LIMIT = 4096;

function pickTrait(r, key) {
  const { values, weights } = TRAITS[key];
  let total = 0;
  for (const w of weights) total += w;
  let x = r * total;
  for (let i = 0; i < values.length; i++) {
    x -= weights[i];
    if (x < 0) return values[i];
  }
  return values[values.length - 1];
}

/** Share of all names that get this trait value, e.g. share("species", "fox") === 0.16. */
function share(key, value) {
  const { values, weights } = TRAITS[key];
  const i = values.indexOf(value);
  if (i < 0) return 0;
  return weights[i] / weights.reduce((a, b) => a + b, 0);
}

function fromName(id) {
  const genes = {};
  for (const key in TRAITS) genes[key] = pickTrait(rnd(id, key), key);
  genes.hue = rnd(id, "hue") * 360;
  for (const key of [...BLENDED, ...SHAPED]) genes[key] = rnd(id, key);
  return Object.freeze({ id, gen: 0, genes: Object.freeze(genes), from: null, parents: null });
}

const memo = new Map();
function remember(key, value) {
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, value);
  return value;
}

/** The genome for a name, a lineage string such as "maya×theo#2", or a genome object. */
function genome(seed) {
  if (seed && typeof seed === "object" && seed.genes) return seed;
  const s = normalize(seed);
  const hit = memo.get(s);
  if (hit) return hit;
  const lineage = s.includes("×") ? parseLineage(s) : null;
  return remember(s, lineage ? breed(lineage.a, lineage.b, { child: lineage.n }) : fromName(s));
}

const wrap = (id) => (id.includes("×") ? `(${id})` : id);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Breed two kits. Each trait comes from one parent (with a small chance of something new),
 * colour and proportions blend. Parent order does not matter; `child` picks a sibling.
 */
function breed(a, b, { child = 0 } = {}) {
  let P = genome(a);
  let Q = genome(b);
  if (Q.id < P.id) [P, Q] = [Q, P];
  const n = Math.max(0, Math.floor(Number(child) || 0));
  const id = `${wrap(P.id)}×${wrap(Q.id)}#${n}`;
  return memo.get(id) ?? remember(id, makeChild(P, Q, id));
}

function makeChild(P, Q, id) {
  const genes = {};
  const from = {};
  for (const key in TRAITS) {
    const src = rnd(id, "pick." + key) < 0.5 ? P : Q;
    let value = src.genes[key];
    let origin = P.genes[key] === Q.genes[key] ? "both" : src.id;
    if (rnd(id, "mut." + key) < MUTATION) {
      const fresh = pickTrait(rnd(id, "new." + key), key);
      if (fresh !== value) {
        value = fresh;
        origin = "new";
      }
    }
    genes[key] = value;
    from[key] = origin;
  }
  // Colour blends the short way round the hue wheel. Parents that clash don't blend,
  // because the midpoint would be an unrelated colour: the child takes one parent's hue.
  const d = ((Q.genes.hue - P.genes.hue + 540) % 360) - 180;
  let base;
  if (Math.abs(d) > 110) {
    const src = rnd(id, "t.hue") < 0.5 ? P : Q;
    base = src.genes.hue;
    from.hue = src.id;
  } else {
    base = P.genes.hue + d * (0.3 + 0.4 * rnd(id, "t.hue"));
    from.hue = "mix";
  }
  genes.hue = (base + (rnd(id, "j.hue") - 0.5) * 14 + 720) % 360;
  for (const key of BLENDED) genes[key] = lerp(P.genes[key], Q.genes[key], 0.2 + 0.6 * rnd(id, "t." + key));
  const bodyFrom = from.body === P.id ? P : from.body === Q.id ? Q : null;
  for (const key of SHAPED) {
    if (from.body === "both") genes[key] = lerp(P.genes[key], Q.genes[key], 0.2 + 0.6 * rnd(id, "t." + key));
    else genes[key] = bodyFrom ? bodyFrom.genes[key] : rnd(id, key);
  }
  return Object.freeze({ id, gen: Math.max(P.gen, Q.gen) + 1, genes: Object.freeze(genes), from: Object.freeze(from), parents: Object.freeze([P.id, Q.id]) });
}

/** "a×b#n" → { a, b, n }. Parenthesised parents nest: "(a×b#1)×c#0". */
function parseLineage(s) {
  let depth = 0;
  let cross = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "×" && depth === 0) {
      cross = i;
      break;
    }
  }
  if (cross < 0) return s[0] === "(" && s[s.length - 1] === ")" ? parseLineage(s.slice(1, -1)) : null;
  let right = s.slice(cross + 1).trim();
  let n = 0;
  const m = right.match(/#(\d+)$/);
  if (m) {
    n = Number(m[1]);
    right = right.slice(0, -m[0].length).trim();
  }
  const unwrap = (x) => (x[0] === "(" && x[x.length - 1] === ")" ? x.slice(1, -1) : x);
  return { a: unwrap(s.slice(0, cross).trim()), b: unwrap(right), n };
}

// ---- color.js
// Colour. Everything is chosen in OKLCh and written out as sRGB hex, because server-side
// rasterisers rarely understand oklch().

function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1.0001);

/** OKLCh → "#rrggbb", reducing chroma until the colour fits in sRGB. */
function oklch(L, C, H) {
  const h = (H * Math.PI) / 180;
  const ca = Math.cos(h);
  const sa = Math.sin(h);
  let rgb = oklabToLinear(L, C * ca, C * sa);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let k = 0; k < 16; k++) {
      const c = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, c * ca, c * sa))) lo = c;
      else hi = c;
    }
    rgb = oklabToLinear(L, lo * ca, lo * sa);
  }
  let out = "#";
  for (let v of rgb) {
    v = Math.min(1, Math.max(0, v));
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    out += Math.round(v * 255).toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * A pipkin's colours: the body, a deep tone and a pale tint of the same hue for details,
 * and an ink for the eyes. Ink clears 6.8:1 against every body colour (see the tests).
 */
function palette(genes) {
  const L = 0.74 + 0.07 * genes.tone;
  const C = 0.105 + 0.04 * genes.chroma;
  const H = genes.hue;
  return {
    body: oklch(L, C, H),
    deep: oklch(L - 0.16, C + 0.01, H),
    tint: oklch(Math.min(0.96, L + 0.17), C * 0.35, H),
    ink: oklch(0.23, 0.03, H),
  };
}

/** Neutral colours for a group, centred on the members' average hue. */
function groupPalette(hues) {
  let x = 0;
  let y = 0;
  for (const h of hues) {
    x += Math.cos((h * Math.PI) / 180);
    y += Math.sin((h * Math.PI) / 180);
  }
  const H = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { tint: oklch(0.95, 0.015, H), ink: oklch(0.23, 0.03, H) };
}

function luminance(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const NAMES = [
  [18, "rose"], [45, "coral"], [72, "peach"], [98, "butter"], [118, "lemon"], [145, "lime"],
  [172, "mint"], [205, "teal"], [235, "sky"], [262, "blue"], [288, "periwinkle"], [318, "lilac"],
  [342, "orchid"], [360, "pink"],
];
/** A plain colour word for a hue, for alt text. */
function colourName(hue) {
  for (const [limit, name] of NAMES) if (hue < limit) return name;
  return "rose";
}

// ---- geometry.js
// Geometry. A body is a few overlapping balls whose fields are summed and traced into one
// smooth outline (metaballs). Fusing simply puts several members' balls in one field.

const TAU = Math.PI * 2;
const REACH = 1.8; // a ball's field reaches 1.8 × its radius
const ISO = Math.pow(1 - 1 / (REACH * REACH), 3); // field value on a lone ball's rim
const OWN_REACH = 3.2; // wider, smoother fields decide who owns which part of a fused body
const GRID = 100; // raster cells across the 100 × 100 viewBox
const MAX_MEMBERS = 9;

// ---------------------------------------------------------------- analytic fields (group space)

function fieldAt(balls, x, y) {
  let f = 0;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    const R2 = b.r * b.r * REACH * REACH;
    const dx = x - b.x;
    const dy = y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < R2) {
      const w = 1 - d2 / R2;
      f += w * w * w;
    }
  }
  return f;
}

function ownerAt(sc, x, y) {
  if (sc.n === 1) return 0;
  const f = new Float64Array(sc.n);
  for (const b of sc.balls) {
    const R2 = b.r * b.r * OWN_REACH * OWN_REACH;
    const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
    if (d2 < R2) {
      const w = 1 - d2 / R2;
      f[b.m] += w * w * w;
    }
  }
  let best = 0;
  for (let i = 1; i < sc.n; i++) if (f[i] > f[best]) best = i;
  return best;
}

// Walk from (x, y) along (dx, dy) until the body ends. Returns [x, y, distance].
function edgeAt(balls, x, y, dx, dy) {
  if (fieldAt(balls, x, y) < ISO) return [x, y, 0];
  const step = 0.02;
  let t = 0;
  while (t < 5 && fieldAt(balls, x + dx * t, y + dy * t) >= ISO) t += step;
  let lo = Math.max(0, t - step);
  let hi = t;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (fieldAt(balls, x + dx * mid, y + dy * mid) >= ISO) lo = mid;
    else hi = mid;
  }
  return [x + dx * lo, y + dy * lo, lo];
}

// ---------------------------------------------------------------- bodies

// Units where the main ball has radius ~1; y points down.
function plan(g) {
  const p = [g.p0, g.p1, g.p2, g.p3];
  const j = (v, a) => (v - 0.5) * 2 * a;
  switch (g.body) {
    case "bean": {
      const s = p[0] < 0.5 ? -1 : 1;
      return {
        balls: [
          { x: -0.36 * s, y: -0.1, r: 0.8 + j(p[1], 0.05) },
          { x: 0.36 * s, y: 0.16, r: 0.78 + j(p[2], 0.05) },
        ],
        face: { x: -0.12 * s, y: -0.14, r: 0.85 },
      };
    }
    case "pear":
      return {
        balls: [
          { x: 0, y: 0.3, r: 0.98 + j(p[0], 0.05) },
          { x: 0, y: -0.5 + j(p[1], 0.05), r: 0.62 + j(p[2], 0.05) },
        ],
        face: { x: 0, y: -0.28, r: 0.78 },
      };
    case "mochi":
      return {
        balls: [
          { x: -0.56, y: 0.22, r: 0.6 + j(p[0], 0.05) },
          { x: 0, y: 0.02, r: 0.9 + j(p[1], 0.04) },
          { x: 0.56, y: 0.22, r: 0.6 + j(p[2], 0.05) },
        ],
        face: { x: 0, y: -0.02, r: 0.88 },
      };
    case "peanut":
      return {
        balls: [
          { x: 0, y: -0.46, r: 0.74 + j(p[0], 0.05) },
          { x: j(p[2], 0.08), y: 0.38, r: 0.8 + j(p[1], 0.05) },
        ],
        face: { x: 0, y: -0.44, r: 0.72 },
      };
    default:
      return {
        balls: [
          { x: 0, y: 0, r: 1 + j(p[0], 0.04) },
          { x: 0, y: 0.26 + j(p[1], 0.06), r: 0.86 + j(p[2], 0.05) },
        ],
        face: { x: 0, y: -0.1, r: 0.95 },
      };
  }
}

// Members of a group sit on a ring (plus one in the middle from seven up), slightly squashed.
function layout(list, gid) {
  const n = list.length;
  if (n === 1) return [{ x: 0, y: 0, s: 1 }];
  const sizes = list.map((g) => 0.92 + 0.16 * g.genes.size);
  const centre = n >= 7 ? Math.floor(rnd(gid, "centre") * n) : -1;
  const ring = list.map((_, i) => i).filter((i) => i !== centre);
  const m = ring.length;
  const rbar = sizes.reduce((a, b) => a + b, 0) / n;
  const rho = m === 2 ? 0.6 * rbar : (1.12 * rbar) / (2 * Math.sin(Math.PI / m));
  const start = -Math.PI / 2 + (m % 2 === 0 ? Math.PI / m : 0) + (rnd(gid, "rot") - 0.5) * 0.3;
  const places = new Array(n);
  ring.forEach((i, k) => {
    const a = start + (TAU * k) / m + (rnd(gid, "a" + k) - 0.5) * 0.2;
    const rr = rho * (1 + (rnd(gid, "r" + k) - 0.5) * 0.14);
    places[i] = { x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.84, s: sizes[i] * 0.9 };
  });
  if (centre >= 0) places[centre] = { x: 0, y: 0, s: sizes[centre] * 0.95 };
  return places;
}

/**
 * Lay out one or more genomes in group space: their balls, faces, centres, and points on the
 * body's edge where ears and feet attach (with whether each point is visible).
 */
function buildScene(list) {
  const n = list.length;
  const gid = n === 1 ? list[0].id : "{" + list.map((g) => g.id).join("+") + "}";
  const places = layout(list, gid);
  const balls = [];
  const members = list.map((g, i) => {
    const P = plan(g.genes);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const b of P.balls) {
      x0 = Math.min(x0, b.x - b.r);
      y0 = Math.min(y0, b.y - b.r);
      x1 = Math.max(x1, b.x + b.r);
      y1 = Math.max(y1, b.y + b.r);
    }
    const pl = places[i];
    const X = (x) => pl.x + pl.s * (x - (x0 + x1) / 2);
    const Y = (y) => pl.y + pl.s * (y - (y0 + y1) / 2);
    for (const b of P.balls) balls.push({ x: X(b.x), y: Y(b.y), r: b.r * pl.s, m: i });
    return { i, face: { x: X(P.face.x), y: Y(P.face.y), r: P.face.r * pl.s }, lobe: { x: pl.x, y: pl.y } };
  });
  const sc = { n, gid, balls, members };
  const probe = (m, ang, reach) => {
    const f = m.face;
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    const [x, y, t] = edgeAt(balls, f.x, f.y, dx, dy);
    const own = n === 1 || ownerAt(sc, x - dx * 0.05 * f.r, y - dy * 0.05 * f.r) === m.i;
    return { x, y, ang, exposed: own && t < f.r * reach };
  };
  sc.anchors = members.map((m) => ({
    earL: probe(m, -0.68, 1.6),
    earR: probe(m, 0.68, 1.6),
    footL: probe(m, Math.PI + 0.42, 3.2),
    footR: probe(m, Math.PI - 0.42, 3.2),
  }));
  return sc;
}

// ---------------------------------------------------------------- raster → outline paths

/**
 * Trace balls (viewBox units, each with an owner `m`) into the body outline and, for a group,
 * one patch per member separated by a gap of `seam` × 2 units.
 */
function bodyPaths(balls, n, seam) {
  const W = GRID + 1;
  const step = 100 / GRID;
  const size = W * W;
  const F = new Float32Array(size);
  splat(F, balls, REACH, W, step, null);
  const D = toDistance(F, W, step, ISO);
  if (n === 1) return { outline: trace(D, W, step), patches: null };
  const own = Array.from({ length: n }, () => new Float32Array(size));
  splat(null, balls, OWN_REACH, W, step, own);
  const top1 = new Float32Array(size);
  const top2 = new Float32Array(size);
  const arg = new Int8Array(size).fill(-1);
  for (let k = 0; k < size; k++)
    for (let m = 0; m < n; m++) {
      const v = own[m][k];
      if (v > top1[k]) {
        top2[k] = top1[k];
        top1[k] = v;
        arg[k] = m;
      } else if (v > top2[k]) top2[k] = v;
    }
  const O = new Float32Array(size);
  const S = new Float32Array(size);
  const patches = [];
  for (let m = 0; m < n; m++) {
    for (let k = 0; k < size; k++) O[k] = own[m][k] - (arg[k] === m ? top2[k] : top1[k]);
    const Od = toDistance(O, W, step, 0);
    for (let k = 0; k < size; k++) S[k] = Math.min(D[k], Od[k] - seam);
    patches.push(trace(S, W, step));
  }
  return { outline: trace(D, W, step), patches };
}

function splat(F, balls, reach, W, step, perOwner) {
  const N = W - 1;
  for (const b of balls) {
    const R = b.r * reach;
    const R2 = R * R;
    const i0 = Math.max(0, Math.floor((b.x - R) / step));
    const i1 = Math.min(N, Math.ceil((b.x + R) / step));
    const j0 = Math.max(0, Math.floor((b.y - R) / step));
    const j1 = Math.min(N, Math.ceil((b.y + R) / step));
    for (let j = j0; j <= j1; j++) {
      const dy = j * step - b.y;
      for (let i = i0; i <= i1; i++) {
        const dx = i * step - b.x;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const w = 1 - d2 / R2;
          const v = w * w * w;
          if (F) F[j * W + i] += v;
          if (perOwner) perOwner[b.m][j * W + i] += v;
        }
      }
    }
  }
}

// First-order signed distance to the iso-line, (V - iso) / |∇V|, in viewBox units.
function toDistance(V, W, step, iso) {
  const out = new Float32Array(W * W);
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const l = i > 0 ? V[k - 1] : V[k];
      const r = i < W - 1 ? V[k + 1] : V[k];
      const u = j > 0 ? V[k - W] : V[k];
      const d = j < W - 1 ? V[k + W] : V[k];
      const gx = (r - l) / ((i > 0 && i < W - 1 ? 2 : 1) * step);
      const gy = (d - u) / ((j > 0 && j < W - 1 ? 2 : 1) * step);
      const v = (V[k] - iso) / Math.max(Math.hypot(gx, gy), 1e-5);
      out[k] = v > 50 ? 50 : v < -50 ? -50 : v;
    }
  return out;
}

// Marching squares → closed loops of points.
function march(V, W, step) {
  const N = W - 1;
  const pts = new Map();
  const adj = new Map();
  const H = (i, j) => j * W + i;
  const Vk = (i, j) => W * W + j * W + i;
  const put = (key, x, y) => {
    if (!pts.has(key)) pts.set(key, [x, y]);
    return key;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const v0 = V[j * W + i];
      const v1 = V[j * W + i + 1];
      const v2 = V[(j + 1) * W + i + 1];
      const v3 = V[(j + 1) * W + i];
      const c = (v0 >= 0 ? 8 : 0) | (v1 >= 0 ? 4 : 0) | (v2 >= 0 ? 2 : 0) | (v3 >= 0 ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const x0 = i * step;
      const y0 = j * step;
      const T = () => put(H(i, j), x0 + (step * v0) / (v0 - v1), y0);
      const B = () => put(H(i, j + 1), x0 + (step * v3) / (v3 - v2), y0 + step);
      const L = () => put(Vk(i, j), x0, y0 + (step * v0) / (v0 - v3));
      const R = () => put(Vk(i + 1, j), x0 + step, y0 + (step * v1) / (v1 - v2));
      const mid = (v0 + v1 + v2 + v3) / 4 >= 0;
      switch (c) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(T(), L()); break;
        case 5:
          if (mid) { link(T(), L()); link(B(), R()); } else { link(T(), R()); link(L(), B()); }
          break;
        case 10:
          if (mid) { link(T(), R()); link(L(), B()); } else { link(T(), L()); link(B(), R()); }
          break;
      }
    }
  const loops = [];
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1;
    let cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

function trace(V, W, step) {
  let d = "";
  for (const loop of march(V, W, step)) {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (Math.abs(area) < 3) continue;
    const pts = simplifyLoop(loop, 0.16);
    if (pts.length >= 3) d += smoothPath(pts);
  }
  return d;
}

function simplifyLoop(loop, eps) {
  if (loop.length < 8) return loop;
  let far = 0;
  let best = -1;
  for (let i = 0; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp(loop.slice(far).concat([loop[0]]), eps);
  const out = a.slice(0, -1).concat(b.slice(0, -1));
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-3;
  });
}

function rdp(pts, eps) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let idx = -1;
    let dmax = eps;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** One decimal place, no "-0". */
const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString();
};

// Closed centripetal Catmull-Rom through the points, written as cubic Béziers.
function smoothPath(pts) {
  const n = pts.length;
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-6;
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-6;
    const l3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || 1e-6;
    const a1 = Math.sqrt(l1);
    const a2 = Math.sqrt(l2);
    const a3 = Math.sqrt(l3);
    const c1 = (k) => (l1 * p2[k] - l2 * p0[k] + (2 * l1 + 3 * a1 * a2 + l2) * p1[k]) / (3 * a1 * (a1 + a2));
    const c2 = (k) => (l3 * p1[k] - l2 * p3[k] + (2 * l3 + 3 * a3 * a2 + l2) * p2[k]) / (3 * a3 * (a3 + a2));
    d += `C${fmt(c1(0))} ${fmt(c1(1))} ${fmt(c2(0))} ${fmt(c2(1))} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d + "Z";
}

// ---- motion.js
// Idle motion for animated kits. Identical to motion.css (a test keeps them in sync); this copy
// exists so `embedMotion: true` can put it inside a self-contained SVG.
//
// Every moving part sits in its own group with its pivot at the local origin, so a transform
// rotates an ear around its base and squashes an eye around its centre:
//   .pipkin-bob      the whole kit (bob up and down)
//   .pipkin-breathe  the whole kit, pivoting at the bottom of the body
//   .pipkin-ear-l/r  each ear, pivoting at its base
//   .pipkin-eye      each eye, pivoting at its centre (blink)
// Per-kit timing comes from CSS variables set on the <svg>, so a crowd never moves in step.
const MOTION_CSS = `.pipkin .pipkin-bob,.pipkin .pipkin-breathe,.pipkin .pipkin-ear,.pipkin .pipkin-eye{transform-box:view-box;transform-origin:0 0}
.pipkin .pipkin-bob{animation:pipkin-bob var(--pipkin-bob,4.4s) ease-in-out var(--pipkin-delay,0s) infinite}
.pipkin .pipkin-breathe{animation:pipkin-breathe var(--pipkin-breathe,3.8s) ease-in-out var(--pipkin-delay,0s) infinite}
.pipkin .pipkin-eye{animation:pipkin-blink var(--pipkin-blink,5s) linear var(--pipkin-blink-delay,0s) infinite}
.pipkin .pipkin-ear-l{animation:pipkin-twitch-l var(--pipkin-twitch,8s) ease-in-out var(--pipkin-twitch-delay,0s) infinite}
.pipkin .pipkin-ear-r{animation:pipkin-twitch-r var(--pipkin-twitch,8s) ease-in-out var(--pipkin-twitch-delay,0s) infinite}
@keyframes pipkin-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.9px)}}
@keyframes pipkin-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,0.982)}}
@keyframes pipkin-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(0.12)}}
@keyframes pipkin-twitch-l{0%,84%,100%{transform:rotate(0deg)}87%{transform:rotate(-12deg)}90%{transform:rotate(5deg)}93%{transform:rotate(0deg)}}
@keyframes pipkin-twitch-r{0%,86%,100%{transform:rotate(0deg)}89%{transform:rotate(12deg)}92%{transform:rotate(-5deg)}95%{transform:rotate(0deg)}}
.pipkin-hover:not(:hover) *{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.pipkin *{animation:none!important}}
`;

// ---- render.js
// Rendering: one flat colour per pipkin, a silhouette made of body, ears and feet, ink eyes.
// Static output is plain shapes. Animated output wraps each moving part in a pivot group.

/** Eye states. "neutral" uses the kit's own eyes; the rest are expressions you can switch to. */
const MOODS = Object.freeze(["neutral", "happy", "sleepy", "grumpy", "worried", "excited", "determined", "smug"]);
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
function draw(list, options) {
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

// ---- index.js
// pipkin: deterministic animal avatars that breed and fuse. Zero dependencies.
//
//   pipkin("maya@acme.co")                       '<svg …>' one pipkin
//   pipkin("maya@acme.co", { animate: true })    the same pipkin, with idle motion (load pipkin/motion.css)
//   breed("maya", "theo", { child: 1 }).id       "maya×theo#1", and pipkin("maya×theo#1") draws that child
//   fuse(["maya", "theo", "zoe"])                one pipkin made of all three, in any order
//
// Same input, same output, with nothing stored.

const VERSION = "0.1.0";

/** One pipkin as an SVG string. `seed` is any name, id or email, a lineage like "a×b#2", or a genome. */
function pipkin(seed, options) {
  return draw([genome(seed)], options);
}

/** One pipkin made of every member (up to 9). Order and duplicates do not matter. */
function fuse(seeds, options) {
  const byId = new Map();
  for (const s of seeds ?? []) {
    const g = genome(s);
    byId.set(g.id, g);
  }
  const list = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_MEMBERS);
  if (!list.length) throw new TypeError("pipkin: fuse() needs at least one name");
  return draw(list, options);
}

/** A data: URI, for <img src>, CSS backgrounds and anywhere that wants a URL. */
function pipkinUri(seed, options) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(pipkin(seed, options));
}

/** fuse() as a data: URI. */
function fuseUri(seeds, options) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(fuse(seeds, options));
}

const EYE_WORDS = { dot: "dot eyes", big: "big eyes", wide: "wide eyes", happy: "happy eyes", line: "sleepy eyes" };

/** A short description for alt text, e.g. "teal bear with dot eyes". */
function describe(seed) {
  const g = genome(seed).genes;
  const animal = g.species === "none" ? "pipkin" : g.species;
  return `${colourName(g.hue)} ${animal} with ${EYE_WORDS[g.eyes]}`;
}

export { VERSION, pipkin, fuse, pipkinUri, fuseUri, breed, genome, describe, share, TRAITS, MOODS, MOTION_CSS, MAX_MEMBERS, normalize, fingerprint };
