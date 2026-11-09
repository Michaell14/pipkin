// Genomes: what a name means as a kit, and how two kits make a third.
import { rnd, normalize } from "./hash.js";

/** The categorical traits, with how often each value appears. Frozen within a major version. */
export const TRAITS = Object.freeze({
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
export function share(key, value) {
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
export function genome(seed) {
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
export function breed(a, b, { child = 0 } = {}) {
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
export function parseLineage(s) {
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
