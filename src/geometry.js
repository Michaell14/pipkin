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

/**
 * Trace balls (viewBox units, each with an owner `m`) into the body outline and, for a group,
 * one patch per member separated by a gap of `seam` × 2 units.
 */
export function bodyPaths(balls, n, seam) {
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
