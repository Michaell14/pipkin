// Geometry. A body is a few overlapping balls whose fields are summed and traced into one
// smooth outline (metaballs). Fusing simply puts several members' balls in one field.
import { rnd } from "./hash.js";

const TAU = Math.PI * 2;
const REACH = 1.8; // a ball's field reaches 1.8 × its radius
const ISO = Math.pow(1 - 1 / (REACH * REACH), 3); // field value on a lone ball's rim
const OWN_REACH = 3.2; // wider, smoother fields decide who owns which part of a fused body
const GRID = 100; // raster cells across the 100 × 100 viewBox
export const MAX_MEMBERS = 9;

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
export function buildScene(list) {
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

// The fields are sampled on a lattice and their iso-lines traced with marching squares. Only the
// cells a line passes through need exact values, so every sample is first labelled inside or
// outside (cheap), and the signed distances are worked out at the corners of crossing cells alone.
// A label is the sign the exact value would have, and the values are computed the same way as
// for a full distance field, so the paths are the ones tracing that whole field would give.
const W = GRID + 1; // samples per side
const CELLS = W * W;
const STEP = 100 / GRID;

// Scratch space, made on first use and reused: drawing is synchronous, so one set is enough.
let scratch = null;
const buffers = () =>
  (scratch ??= {
    F: new Float32Array(CELLS), // the body's field
    label: new Uint8Array(CELLS), // 0 outside; m + 1 inside member m's part
    val: new Float32Array(CELLS), // exact values at the corners of crossing cells
    known: new Uint8Array(CELLS), // which of `val` are filled in
    slot: new Int32Array(2 * CELLS).fill(-1), // lattice edge → the point on it
    own: [], // groups only: one ownership field per member,
    top1: null, // the strongest of them at each sample,
    top2: null, // the runner-up,
    arg: null, // and whose the strongest is
  });

/**
 * Trace balls (viewBox units, each with an owner `m`) into the body outline for one pipkin, or
 * for a group into one patch per member, separated by a gap of `seam` × 2 units (`seam` > 0).
 */
export function bodyPaths(balls, n, seam) {
  const B = buffers();
  const { F, label } = B;
  F.fill(0);
  label.fill(0);
  splat(F, null, balls, REACH);
  if (n === 1) {
    const box = [W, -1, W, -1];
    for (let j = 0, k = 0; j < W; j++)
      for (let i = 0; i < W; i++, k++)
        if (F[k] >= ISO) {
          label[k] = 1;
          grow(box, i, j);
        }
    return { outline: trace(B, 1, box, (k, i, j) => bodyDistance(F, k, i, j)), patches: null };
  }
  const own = B.own;
  while (own.length < n) own.push(new Float32Array(CELLS));
  for (let m = 0; m < n; m++) own[m].fill(0);
  splat(null, own, balls, OWN_REACH);
  const top1 = (B.top1 ??= new Float32Array(CELLS)).fill(0);
  const top2 = (B.top2 ??= new Float32Array(CELLS)).fill(0);
  const arg = (B.arg ??= new Int8Array(CELLS)).fill(-1);
  for (let m = 0; m < n; m++) {
    const O = own[m];
    for (let k = 0; k < CELLS; k++) {
      const v = O[k];
      if (v > top1[k]) {
        top2[k] = top1[k];
        top1[k] = v;
        arg[k] = m;
      } else if (v > top2[k]) top2[k] = v;
    }
  }
  // A sample is in a member's patch when it is inside the body and that member leads there by
  // more than the seam. Only the strongest owner can, so each sample needs one test.
  const boxes = Array.from({ length: n }, () => [W, -1, W, -1]);
  for (let j = 0, k = 0; j < W; j++)
    for (let i = 0; i < W; i++, k++) {
      const m = arg[k];
      if (m < 0 || !(F[k] >= ISO)) continue;
      if (leadDistance(own[m], top1, top2, arg, m, k, i, j) - seam >= 0) {
        label[k] = m + 1;
        grow(boxes[m], i, j);
      }
    }
  const patches = [];
  for (let m = 0; m < n; m++) {
    const O = own[m];
    patches.push(trace(B, m + 1, boxes[m], (k, i, j) => Math.fround(Math.min(bodyDistance(F, k, i, j), leadDistance(O, top1, top2, arg, m, k, i, j) - seam))));
  }
  return { outline: null, patches };
}

// Add each ball's field, (1 − d²/R²)³ within R = r × reach, to F or to its owner's own field.
function splat(F, own, balls, reach) {
  const N = W - 1;
  for (const b of balls) {
    const out = own ? own[b.m] : F;
    const R = b.r * reach;
    const R2 = R * R;
    const i0 = Math.max(0, Math.floor((b.x - R) / STEP));
    const i1 = Math.min(N, Math.ceil((b.x + R) / STEP));
    const j0 = Math.max(0, Math.floor((b.y - R) / STEP));
    const j1 = Math.min(N, Math.ceil((b.y + R) / STEP));
    for (let j = j0; j <= j1; j++) {
      const dy = j * STEP - b.y;
      for (let i = i0; i <= i1; i++) {
        const dx = i * STEP - b.x;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const w = 1 - d2 / R2;
          out[j * W + i] += w * w * w;
        }
      }
    }
  }
}

function grow(box, i, j) {
  if (i < box[0]) box[0] = i;
  if (i > box[1]) box[1] = i;
  if (j < box[2]) box[2] = j;
  if (j > box[3]) box[3] = j;
}

// First-order signed distance to the iso-line at one sample, (v − iso) / |∇v|, in viewBox units
// and as a 32-bit float. l, r, u and d are the neighbouring samples (the sample itself at an edge).
function distance(v, l, r, u, d, i, j, iso) {
  const gx = (r - l) / ((i > 0 && i < W - 1 ? 2 : 1) * STEP);
  const gy = (d - u) / ((j > 0 && j < W - 1 ? 2 : 1) * STEP);
  const out = (v - iso) / Math.max(Math.hypot(gx, gy), 1e-5);
  return Math.fround(out > 50 ? 50 : out < -50 ? -50 : out);
}

// Distance to the body's edge.
const bodyDistance = (F, k, i, j) => distance(F[k], i > 0 ? F[k - 1] : F[k], i < W - 1 ? F[k + 1] : F[k], j > 0 ? F[k - W] : F[k], j < W - 1 ? F[k + W] : F[k], i, j, ISO);

// How far member m's own field leads the strongest other one, and the distance to where it stops leading.
const lead = (O, top1, top2, arg, m, k) => Math.fround(O[k] - (arg[k] === m ? top2[k] : top1[k]));
function leadDistance(O, top1, top2, arg, m, k, i, j) {
  const v = lead(O, top1, top2, arg, m, k);
  const l = i > 0 ? lead(O, top1, top2, arg, m, k - 1) : v;
  const r = i < W - 1 ? lead(O, top1, top2, arg, m, k + 1) : v;
  const u = j > 0 ? lead(O, top1, top2, arg, m, k - W) : v;
  const d = j < W - 1 ? lead(O, top1, top2, arg, m, k + W) : v;
  return distance(v, l, r, u, d, i, j, 0);
}

// Marching squares around the samples labelled `want` (all of them within `box`), written as
// smoothed closed paths. `valueAt` gives a sample's exact field value; it is asked only about
// the corners of cells the line crosses.
function trace(B, want, box, valueAt) {
  const { label, val, known, slot } = B;
  const N = W - 1;
  const pts = []; // points on the line, in the order they are first met
  const edges = []; // the lattice edge each point sits on
  const nb0 = []; // each point's neighbours along the line
  const nb1 = [];
  const touched = [];
  const value = (k, i, j) => {
    if (!known[k]) {
      val[k] = valueAt(k, i, j);
      known[k] = 1;
      touched.push(k);
    }
    return val[k];
  };
  const put = (edge, x, y) => {
    let p = slot[edge];
    if (p < 0) {
      p = slot[edge] = pts.length;
      pts.push([x, y]);
      edges.push(edge);
      nb0.push(-1);
      nb1.push(-1);
    }
    return p;
  };
  const link = (a, b) => {
    if (nb0[a] < 0) nb0[a] = b;
    else if (nb1[a] < 0) nb1[a] = b;
    if (nb0[b] < 0) nb0[b] = a;
    else if (nb1[b] < 0) nb1[b] = a;
  };
  // The cell being visited: its corner column and row, its top-left corner, and its corner values
  // clockwise from there. Horizontal lattice edges are numbered from 0, vertical ones from CELLS.
  let i = 0;
  let j = 0;
  let x0 = 0;
  let y0 = 0;
  let v0 = 0;
  let v1 = 0;
  let v2 = 0;
  let v3 = 0;
  const T = () => put(j * W + i, x0 + (STEP * v0) / (v0 - v1), y0);
  const Bo = () => put((j + 1) * W + i, x0 + (STEP * v3) / (v3 - v2), y0 + STEP);
  const L = () => put(CELLS + j * W + i, x0, y0 + (STEP * v0) / (v0 - v3));
  const R = () => put(CELLS + j * W + i + 1, x0 + STEP, y0 + (STEP * v1) / (v1 - v2));
  const iEnd = Math.min(N - 1, box[1]);
  const jEnd = Math.min(N - 1, box[3]);
  let d = "";
  try {
    for (j = Math.max(0, box[2] - 1); j <= jEnd; j++)
      for (i = Math.max(0, box[0] - 1); i <= iEnd; i++) {
        const k = j * W + i;
        const c = (label[k] === want ? 8 : 0) | (label[k + 1] === want ? 4 : 0) | (label[k + W + 1] === want ? 2 : 0) | (label[k + W] === want ? 1 : 0);
        if (c === 0 || c === 15) continue;
        v0 = value(k, i, j);
        v1 = value(k + 1, i + 1, j);
        v2 = value(k + W + 1, i + 1, j + 1);
        v3 = value(k + W, i, j + 1);
        x0 = i * STEP;
        y0 = j * STEP;
        const mid = (v0 + v1 + v2 + v3) / 4 >= 0;
        switch (c) {
          case 1: case 14: link(L(), Bo()); break;
          case 2: case 13: link(Bo(), R()); break;
          case 3: case 12: link(L(), R()); break;
          case 4: case 11: link(T(), R()); break;
          case 6: case 9: link(T(), Bo()); break;
          case 7: case 8: link(T(), L()); break;
          case 5:
            if (mid) { link(T(), L()); link(Bo(), R()); } else { link(T(), R()); link(L(), Bo()); }
            break;
          case 10:
            if (mid) { link(T(), R()); link(L(), Bo()); } else { link(T(), L()); link(Bo(), R()); }
            break;
        }
      }
    // Walk the points into closed loops and write each one out.
    const seen = new Uint8Array(pts.length);
    for (let start = 0; start < pts.length; start++) {
      if (seen[start]) continue;
      const loop = [];
      let prev = -1;
      let cur = start;
      while (cur >= 0 && !seen[cur]) {
        seen[cur] = 1;
        loop.push(pts[cur]);
        const next = nb0[cur] !== prev ? nb0[cur] : nb1[cur];
        prev = cur;
        cur = next;
      }
      if (loop.length > 3) d += loopPath(loop);
    }
  } finally {
    // The scratch space goes back clean, whatever happened.
    for (const k of touched) known[k] = 0;
    for (const edge of edges) slot[edge] = -1;
  }
  return d;
}

function loopPath(loop) {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (Math.abs(area) < 3) return "";
  const pts = simplifyLoop(loop, 0.16);
  return pts.length >= 3 ? smoothPath(pts) : "";
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
export const fmt = (v) => {
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
