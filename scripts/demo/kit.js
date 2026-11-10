// A small animation kit for the demo videos. Everything on the page is a pure function of the
// time t (in ms): seek(t) can be called for any frame, in any order, so frames render in parallel.
// The library is inlined before this file, so its internals (plan, layout, edgeAt…) are in scope.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- easing

function bez(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = ((ax * t + bx) * t + cx) * t - x;
      if (Math.abs(e) < 1e-5) break;
      t -= e / ((3 * ax * t + 2 * bx) * t + cx || 1e-6);
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
const E = {
  lin: (t) => t,
  out: bez(0.16, 1, 0.3, 1),
  soft: bez(0.33, 1, 0.68, 1),
  in: bez(0.6, 0, 0.9, 0.3),
  io: bez(0.65, 0, 0.35, 1),
  back: bez(0.34, 1.56, 0.64, 1),
  // A damped spring that settles on 1. Lower z is bouncier.
  spring: (z = 0.5, w = 13) => (t) => {
    if (t >= 1) return 1;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  },
};
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- timeline

const TRACKS = new Map();
const HOOKS = [];
const BASE = { x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, o: 1 };

/** Tween properties of elements (or of a plain object). `{ y: [40, 0] }` or `{ y: 0 }` to continue from the last value. */
function tw(target, props, t0, dur = 600, ease = E.out) {
  for (const one of [].concat(target)) {
    let tracks = TRACKS.get(one);
    if (!tracks) TRACKS.set(one, (tracks = {}));
    for (const k in props) {
      const list = (tracks[k] ||= []);
      const prev = list.length ? list[list.length - 1].to : (BASE[k] ?? 0);
      const [from, to] = Array.isArray(props[k]) ? props[k] : [prev, props[k]];
      list.push({ t0, dur, from, to, ease });
    }
  }
}
function valueAt(list, t) {
  let seg = list[0];
  if (t <= seg.t0) return seg.from;
  for (const s of list) {
    if (s.t0 <= t) seg = s;
    else break;
  }
  return mix(seg.from, seg.to, seg.ease(seg.dur ? clamp((t - seg.t0) / seg.dur) : 1));
}
/** Run fn(t) on every frame, after the tweens. */
const on = (fn) => HOOKS.push(fn);

let SORTED = false;
function seek(t) {
  if (!SORTED) {
    for (const tracks of TRACKS.values()) for (const k in tracks) tracks[k].sort((a, b) => a.t0 - b.t0);
    SORTED = true;
  }
  for (const [target, tracks] of TRACKS) {
    const v = {};
    for (const k in tracks) v[k] = valueAt(tracks[k], t);
    if (!(target instanceof Element)) {
      Object.assign(target, v);
      continue;
    }
    const st = target.style;
    if ("x" in v || "y" in v || "s" in v || "sx" in v || "sy" in v || "r" in v) {
      const s = v.s ?? 1;
      st.transform = `translate(${(v.x ?? 0).toFixed(2)}px,${(v.y ?? 0).toFixed(2)}px) rotate(${(v.r ?? 0).toFixed(3)}deg) scale(${(s * (v.sx ?? 1)).toFixed(4)},${(s * (v.sy ?? 1)).toFixed(4)})`;
    }
    if ("o" in v) {
      st.opacity = v.o.toFixed(3);
      st.visibility = v.o <= 0.001 ? "hidden" : "";
    }
    for (const k in v) if (!(k in BASE)) st.setProperty("--" + k, v[k].toFixed(4));
  }
  for (const fn of HOOKS) fn(t);
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = t;
  }
}

// ---------------------------------------------------------------- entrances and text

const each = (els, fn) => [].concat(els).forEach(fn);
/** Fade up into place. */
const rise = (els, t0, { d = 50, dur = 700, gap = 0, ease = E.out } = {}) =>
  each(els, (e, i) => {
    tw(e, { o: [0, 1] }, t0 + i * gap, Math.min(dur, 320), E.soft);
    tw(e, { y: [d, 0] }, t0 + i * gap, dur, ease);
  });
/** Fade away, drifting by d. */
const leave = (els, t0, { d = -30, dur = 320, gap = 0 } = {}) =>
  each(els, (e, i) => {
    tw(e, { o: 0 }, t0 + i * gap, dur, E.in);
    tw(e, { y: d }, t0 + i * gap, dur, E.in);
  });
/** Spring up from nothing. */
const pop = (els, t0, { dur = 700, gap = 0, from = 0.3, z = 0.5 } = {}) =>
  each(els, (e, i) => {
    tw(e, { o: [0, 1] }, t0 + i * gap, 110, E.lin);
    tw(e, { s: [from, 1] }, t0 + i * gap, dur, E.spring(z));
  });
/** Shrink away. */
const unpop = (els, t0, { dur = 240, gap = 0 } = {}) =>
  each(els, (e, i) => {
    tw(e, { o: 0 }, t0 + i * gap + dur * 0.4, dur * 0.6, E.lin);
    tw(e, { s: 0.6 }, t0 + i * gap, dur, E.in);
  });
/** Show a scene only between t0 and t1. */
const scene = (node, t0, t1) => on((t) => (node.style.display = t >= t0 && t < t1 ? "" : "none"));

/** Split an element's text into masked words; returns the inner spans to animate. */
function words(node) {
  const out = [];
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) frag.append(" ");
          else {
            const w = document.createElement("span");
            w.className = "w";
            const inner = document.createElement("span");
            inner.textContent = part;
            w.append(inner);
            frag.append(w);
            out.push(inner);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== "BR") walk(child);
    }
  };
  walk(node);
  return out;
}
/** A headline whose words rise out of their masks, one after another. */
function headline(node, t0, { gap = 55, dur = 760 } = {}) {
  const px = parseFloat(getComputedStyle(node).fontSize);
  const ws = words(node);
  ws.forEach((w, i) => tw(w, { y: [px * 1.25, 0] }, t0 + i * gap, dur, E.out));
  return ws;
}
/** Send a headline's words up and out of their masks. */
function headlineOut(ws, t0, { gap = 22, dur = 300 } = {}) {
  const px = parseFloat(getComputedStyle(ws[0]).fontSize);
  ws.forEach((w, i) => tw(w, { y: -px * 1.25 }, t0 + i * gap, dur, E.in));
}

/** Keystroke times for a string: a steady rhythm with a little human jitter. */
function keystrokes(text, t0, { cps = 13, jitter = 0.45, seed = "keys" } = {}) {
  const out = [];
  let t = t0;
  for (let i = 0; i < text.length; i++) {
    out.push(Math.round(t));
    t += (1000 / cps) * (1 + (rnd(seed + text, "k" + i) - 0.5) * 2 * jitter);
  }
  return out;
}
const typedAt = (times, t) => {
  let n = 0;
  while (n < times.length && times[n] <= t) n++;
  return n;
};
/** The latest value in a [[time, value], …] list. */
const latest = (list, t) => {
  let hit = list[0];
  for (const item of list) if (item[0] <= t) hit = item;
  return hit;
};

// ---------------------------------------------------------------- hero: a pipkin you can direct

/**
 * A pipkin drawn into `host` whose blinks, ear twitches, hops and glances are scheduled on the
 * timeline. Its name and mood can change over time too.
 */
function hero(host, name, opt = {}) {
  host.classList.add("manual");
  const h = {
    host,
    v: { gx: 0, gy: 0, sq: 0 },
    names: [[-1e9, name]],
    moods: [[-1e9, opt.mood || "neutral"]],
    blinks: [],
    twitches: [],
    hops: [],
    swaps: [],
    key: "",
  };
  const period = 3000 + 900 * rnd(name, "demo.period");
  const phase = 3000 * rnd(name, "demo.phase");
  const amp = opt.breathe ?? 0.016;
  h.blink = (...ts) => (h.blinks.push(...ts), h);
  h.twitch = (t, side = "lr", a = 16) => (h.twitches.push([t, side, a]), h);
  h.hop = (t, height = 40, dur = 420) => (h.hops.push([t, height, dur]), h);
  h.look = (t, gx, gy = 0, dur = 260) => (tw(h.v, { gx, gy }, t, dur, E.io), h);
  h.squash = (t, amount, dur = 200, ease = E.out) => (tw(h.v, { sq: amount }, t, dur, ease), h);
  h.name = (t, n, bump = true) => (h.names.push([t, n]), bump && h.swaps.push(t), h);
  h.mood = (t, m, bump = true) => (h.moods.push([t, m]), bump && h.swaps.push(t), h);
  on((t) => {
    const who = latest(h.names, t)[1];
    const mood = latest(h.moods, t)[1];
    const key = who + "|" + mood;
    if (key !== h.key) {
      const o = { animate: true, mood, background: opt.background };
      host.innerHTML = opt.render ? opt.render(who, o) : pipkin(who, o);
      h.key = key;
      h.eyes = $$(".pipkin-eye", host);
      h.earL = $(".pipkin-ear-l", host);
      h.earR = $(".pipkin-ear-r", host);
      h.body = $(".pipkin-breathe", host);
      h.onchange?.(who, mood);
    }
    let lid = 1;
    for (const b of h.blinks) {
      const d = t - b;
      if (d >= 0 && d < 190) lid = Math.min(lid, d < 70 ? mix(1, 0.08, d / 70) : mix(0.08, 1, (d - 70) / 120));
    }
    let q = amp * Math.sin(((t + phase) / period) * TAU) + h.v.sq;
    let y = 0;
    let earL = 0;
    let earR = 0;
    for (const [t0, height, dur] of h.hops) {
      const d = t - t0;
      if (d >= -130 && d < 0) q += 0.11 * Math.sin((Math.PI * (d + 130)) / 130);
      else if (d >= 0 && d <= dur) {
        const p = d / dur;
        y -= height * 4 * p * (1 - p);
        q -= 0.075 * Math.sin(Math.PI * p);
        earL += 9 * Math.sin(Math.PI * p) * (p < 0.5 ? 1 : -0.6);
        earR -= 9 * Math.sin(Math.PI * p) * (p < 0.5 ? 1 : -0.6);
      } else if (d > dur && d < dur + 520) {
        const e = d - dur;
        const wob = Math.exp(-e / 110) * Math.cos((e / 520) * TAU * 1.6);
        q += 0.15 * wob;
        earL -= 10 * wob;
        earR += 10 * wob;
      }
    }
    for (const s of h.swaps) {
      const d = t - s;
      if (d >= 0 && d < 420) q += 0.13 * Math.exp(-d / 85) * Math.cos((d / 420) * TAU * 1.7);
    }
    for (const [t0, side, a] of h.twitches) {
      const d = t - t0;
      if (d < 0 || d > 460) continue;
      const w = a * Math.sin((d / 460) * Math.PI * 3) * (1 - d / 460);
      if (side.includes("l")) earL -= w;
      if (side.includes("r")) earR += w;
    }
    for (const eye of h.eyes) eye.style.transform = `translate(${h.v.gx.toFixed(2)}px,${h.v.gy.toFixed(2)}px) scaleY(${lid.toFixed(3)})`;
    if (h.earL) h.earL.style.transform = `rotate(${earL.toFixed(2)}deg)`;
    if (h.earR) h.earR.style.transform = `rotate(${earR.toFixed(2)}deg)`;
    if (h.body) h.body.style.transform = `scale(${(1 + q).toFixed(4)},${(1 - q).toFixed(4)})`;
    host.style.translate = `0 ${y.toFixed(2)}px`;
  });
  return h;
}

// ---------------------------------------------------------------- melt: fusing, as it happens

// bodyPaths() from the library, on a finer and larger raster (one cell per view unit).
function bodyPathsWide(balls, n, seam, cells) {
  const W = cells + 1;
  const size = W * W;
  const F = new Float32Array(size);
  splat(F, balls, REACH, W, 1, null);
  const D = toDistance(F, W, 1, ISO);
  if (n === 1) return { outline: trace(D, W, 1), patches: null };
  const own = Array.from({ length: n }, () => new Float32Array(size));
  splat(null, balls, OWN_REACH, W, 1, own);
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
    const Od = toDistance(O, W, 1, 0);
    for (let k = 0; k < size; k++) S[k] = Math.min(D[k], Od[k] - seam);
    patches.push(trace(S, W, 1));
  }
  return { outline: trace(D, W, 1), patches };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Where fuse() puts each member: { id: { x, y, s, m: 1 } } in group units. */
function fusedPlaces(names) {
  const list = names.map(genome).sort(byId);
  const gid = list.length === 1 ? list[0].id : "{" + list.map((g) => g.id).join("+") + "}";
  const pl = layout(list, gid);
  return Object.fromEntries(list.map((g, i) => [g.id, { x: pl[i].x, y: pl[i].y, s: pl[i].s, m: 1 }]));
}
/** Blend two placements. k moves the bodies, km merges each member's two eyes into one. */
function mixPlaces(A, B, k, km = k) {
  const out = {};
  for (const id in A) out[id] = { x: mix(A[id].x, B[id].x, k), y: mix(A[id].y, B[id].y, k), s: mix(A[id].s, B[id].s, k), m: mix(A[id].m, B[id].m, km) };
  return out;
}

// One moment of a melt: bodies, faces and which ears and feet reach open air.
function meltScene(list, P) {
  const n = list.length;
  const balls = [];
  const members = list.map((g, i) => {
    const plan0 = plan(g.genes);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const b of plan0.balls) {
      x0 = Math.min(x0, b.x - b.r);
      y0 = Math.min(y0, b.y - b.r);
      x1 = Math.max(x1, b.x + b.r);
      y1 = Math.max(y1, b.y + b.r);
    }
    const pl = P[g.id];
    const X = (x) => pl.x + pl.s * (x - (x0 + x1) / 2);
    const Y = (y) => pl.y + pl.s * (y - (y0 + y1) / 2);
    const own = plan0.balls.map((b) => ({ x: X(b.x), y: Y(b.y), r: b.r * pl.s, m: i }));
    balls.push(...own);
    return { i, own, pl, face: { x: X(plan0.face.x), y: Y(plan0.face.y), r: plan0.face.r * pl.s } };
  });
  const sc = { n, balls, members };
  const probe = (m, ang, reach) => {
    const f = m.face;
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    const [x, y, all] = edgeAt(balls, f.x, f.y, dx, dy);
    const mine = edgeAt(m.own, f.x, f.y, dx, dy)[2];
    const owned = n === 1 || ownerAt(sc, x - dx * 0.05 * f.r, y - dy * 0.05 * f.r) === m.i;
    const d = Math.min(all, mine + 0.12 * f.r);
    return { x: f.x + dx * d, y: f.y + dy * d, ang, exposed: owned && all < f.r * reach ? 1 : 0 };
  };
  sc.anchors = members.map((m) => [probe(m, -0.68, 1.6), probe(m, 0.68, 1.6), probe(m, Math.PI + 0.42, 3.2), probe(m, Math.PI - 0.42, 3.2)]);
  return sc;
}

/**
 * Draw members part-way through fusing. `placesAt(t)` gives every member's place at a time;
 * ears and feet grow and shrink over a few frames as they become exposed or covered.
 */
function meltSvg(names, placesAt, t, opt = {}) {
  const S = opt.scale ?? 30;
  const cells = opt.cells ?? 300;
  const [vx, vy, vw, vh] = opt.view ?? [0, 0, cells, cells];
  const list = names.map(genome).sort(byId);
  const n = list.length;
  const P = placesAt(t);
  const sc = meltScene(list, P);
  // Exposure, averaged over the last few moments so parts never pop.
  const TAPS = 7;
  const expo = sc.anchors.map((a) => a.map((p) => p.exposed));
  for (let j = 1; j < TAPS; j++) {
    const past = meltScene(list, placesAt(t - j * 28));
    past.anchors.forEach((a, i) => a.forEach((p, k) => (expo[i][k] += p.exposed)));
  }
  const X = (x) => cells / 2 + (x - (opt.cx ?? 0)) * S;
  const Y = (y) => cells / 2 + (y - (opt.cy ?? 0)) * S;
  const cols = list.map((g) => palette(g.genes));
  const vb = sc.balls.map((b) => ({ x: X(b.x), y: Y(b.y), r: b.r * S, m: b.m }));
  const { outline, patches } = bodyPathsWide(vb, n, (opt.seam ?? 0.04) * S, cells);

  let feet = "";
  let ears = "";
  let eyes = "";
  const gx = sc.members.reduce((a, m) => a + m.pl.x, 0) / n;
  const gy = sc.members.reduce((a, m) => a + m.pl.y, 0) / n;
  const pull = n <= 4 ? 0.32 : 0.18;
  sc.members.forEach((m, i) => {
    const g = list[i].genes;
    const u = m.face.r * S;
    const A = sc.anchors[i];
    const grow = (k) => smooth(0, 1, expo[i][k] / TAPS);
    for (const k of [2, 3]) {
      const e = grow(k);
      if (e > 0.01) feet += `<ellipse cx="${fmt(X(A[k].x))}" cy="${fmt(Y(A[k].y) - 0.02 * u)}" rx="${fmt(0.19 * u * e)}" ry="${fmt(0.12 * u * e)}" fill="${cols[i].body}"/>`;
    }
    if (g.species !== "none")
      for (const k of [0, 1]) {
        const e = grow(k);
        if (e <= 0.01) continue;
        const ang = g.species === "bunny" ? A[k].ang * 0.45 : A[k].ang;
        ears += `<g transform="translate(${fmt(X(A[k].x))} ${fmt(Y(A[k].y))}) rotate(${fmt((ang * 180) / Math.PI)}) scale(${e.toFixed(3)})">${earShape(g.species, u, cols[i].body)}</g>`;
      }
    // Two eyes slide together into the one eye a fused member keeps.
    const f = m.face;
    const k = m.pl.m;
    const ex = mix(f.x, f.x + (gx - f.x) * pull, k);
    const ey = mix(f.y + f.r * (0.04 + 0.08 * g.eyeY), f.y + (gy - f.y) * pull + f.r * 0.04, k);
    const r = mix(0.115, 0.15, k) * u;
    const gap = f.r * (0.27 + 0.08 * g.eyeGap) * (1 - k);
    const lid = opt.lid ? opt.lid(i, list[i].id) : 1;
    for (const side of gap * S < 0.3 ? [0] : [-1, 1])
      eyes += `<g transform="translate(${fmt(X(ex + side * gap))} ${fmt(Y(ey))}) scale(1 ${lid.toFixed(3)})">${eyeShape(g.eyes, r, cols[i].ink, side || 1)}</g>`;
  });
  const body = n === 1 ? `<path d="${outline}" fill="${cols[0].body}"/>` : patches.map((d, i) => `<path d="${d}" fill="${cols[i].body}" fill-rule="evenodd"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}">${feet}${ears}${body}${eyes}</svg>`;
}

/** Keep `host` showing the melt for the current frame while its scene is on screen. */
function melter(host, names, placesAt, opt = {}) {
  let last = "";
  on((t) => {
    if (t < (opt.from ?? -1e9) || t > (opt.to ?? 1e9)) return;
    const blink = opt.blinks ? { lid: (i, id) => lidAt(opt.blinks[id] || [], t) } : {};
    const key = JSON.stringify([placesAt(t), placesAt(t - 170), blink.lid ? names.map((id, i) => blink.lid(i, id)) : 0]);
    if (key === last) return;
    last = key;
    host.innerHTML = meltSvg(names, placesAt, t, { ...opt, ...blink });
  });
}
function lidAt(times, t) {
  let lid = 1;
  for (const b of times) {
    const d = t - b;
    if (d >= 0 && d < 190) lid = Math.min(lid, d < 70 ? mix(1, 0.08, d / 70) : mix(0.08, 1, (d - 70) / 120));
  }
  return lid;
}

// ---------------------------------------------------------------- acts: the set pieces every cut reuses

const add = (parent, html) => {
  parent.insertAdjacentHTML("beforeend", html);
  return parent.lastElementChild;
};
const trackAt = (obj, key, t) => valueAt(TRACKS.get(obj)[key], t);

/** A directed pipkin of size d centred on (x, y) inside `root`, with an optional label under it. */
function spot(root, x, y, d, name, label, opt) {
  const wrap = add(root, `<div class="pk" style="left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px"><div class="pk" style="inset:0"></div></div>`);
  const tag = label == null ? null : add(root, `<div class="tag" style="left:${x - 200}px;top:${y + d / 2 + 4}px;width:400px">${label}</div>`);
  return { wrap, tag, h: hero(wrap.firstElementChild, name, opt) };
}

/**
 * Breeding. Two parents look at each other, hop together and bump; a family tree draws down to
 * a row of their children. Everything is placed in px inside `root` (o.w x o.h).
 */
function breedAct(root, T, o) {
  const { a, b, cx, py, pd, half, ky, kd, kstep, kids: count } = o;
  const tree = add(root, `<svg class="tree" viewBox="0 0 ${o.w} ${o.h}"></svg>`);
  const times = add(root, `<div class="times" style="left:${cx}px;top:${py}px">×</div>`);
  const pa = spot(root, cx - half, py, pd, a);
  const pb = spot(root, cx + half, py, pd, b);
  const inA = o.inA ?? T + 200;
  const inB = o.inB ?? T + 330;
  pop(pa.wrap, inA, { dur: 760 });
  pop(pb.wrap, inB, { dur: 760 });
  const bump = o.bump ?? T + 1290;
  pa.h.blink(inA + 420).look(Math.max(inB + 300, bump - 600), 2.4, 0);
  pb.h.blink(inB + 430).look(Math.max(inB + 380, bump - 520), -2.4, 0);
  pop(times, Math.min(Math.max(inB + 420, bump - 480), bump - 330), { dur: 500 });
  // Together, bump, and back.
  const reach = half - pd * 0.4;
  for (const [p, dir] of [[pa, 1], [pb, -1]]) {
    p.h.hop(bump - 250, pd * 0.12, 250);
    tw(p.wrap, { x: [0, dir * reach] }, bump - 250, 250, E.in);
    tw(p.wrap, { x: 0 }, bump, 900, E.spring(0.42, 12));
  }
  tw(times, { o: 0 }, bump - 200, 120, E.lin);
  tw(times, { o: 1 }, bump + 250, 300, E.lin);
  const cols = [palette(genome(a).genes).body, palette(genome(b).genes).body];
  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const dash = add(root, `<div class="spark" style="left:${cx}px;top:${py}px;rotate:${i * 36 + 18}deg"><span style="background:${cols[i % 2]}"></span></div>`).firstElementChild;
    tw(dash, { o: [0, 1] }, bump, 40, E.lin);
    tw(dash, { y: [-pd * 0.1, -pd * 0.58] }, bump, 520, E.out);
    tw(dash, { sy: [1, 0.2] }, bump + 120, 400, E.soft);
    tw(dash, { o: 0 }, bump + 330, 190, E.lin);
    sparks.push(dash);
  }
  // The tree: a trunk from between the parents, a bar, and a drop to each child.
  const line = (d, t0, dur) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("pathLength", "1");
    tree.append(p);
    tw(p, { draw: [0, 1] }, t0, dur, E.io);
    return p;
  };
  const top = py + pd * 0.36;
  const bar = ky - kd / 2 - 46;
  const xs = Array.from({ length: count }, (_, i) => cx + (i - (count - 1) / 2) * kstep);
  const lines = [line(`M${cx} ${top}V${bar}`, bump + 120, 260)];
  for (const x of xs) lines.push(Math.abs(x - cx) < 1 ? line(`M${cx} ${bar}V${bar + 40}`, bump + 340, 360) : line(`M${cx} ${bar}H${x + (x < cx ? 26 : -26)}Q${x} ${bar} ${x} ${bar + 26}V${bar + 40}`, bump + 340, 360));
  const kids = xs.map((x, i) => spot(root, x, ky, kd, `${a}×${b}#${i}`, o.tags === false ? null : `#${i}`));
  kids.forEach((k, i) => {
    const t0 = bump + 600 + i * 130;
    pop(k.wrap, t0, { dur: 760, from: 0.1, z: 0.45 });
    if (k.tag) rise(k.tag, t0 + 160, { d: 14, dur: 380 });
    k.h.blink(t0 + 600 + ((i * 370) % 900), t0 + 1700 + ((i * 230) % 500));
  });
  kids[1 % count].h.hop(bump + 1750, kd * 0.16);
  kids[count - 1].h.hop(bump + 1990, kd * 0.13);
  kids[0].h.twitch(bump + 1500);
  pa.h.look(bump + 900, 1.2, 2.2).blink(bump + 1300);
  pb.h.look(bump + 980, -1.2, 2.2).blink(bump + 1650);
  return {
    bump,
    pa,
    pb,
    kids,
    out(t) {
      unpop([pa.wrap, pb.wrap, ...kids.map((k) => k.wrap)], t + 20, { gap: 26 });
      leave([...kids.map((k) => k.tag).filter(Boolean), times], t, { d: 0, dur: 200 });
      tw(lines, { o: 0 }, t, 220, E.lin);
    },
  };
}

/**
 * Fusing. The team stands in a row, leans back, rushes together and melts into one body while
 * the camera pushes in. `host` is a 2:1 box; o.unit is how many px one group unit covers in it.
 */
function fuseAct(root, host, T, o) {
  const { team } = o;
  const gap = o.gap ?? 2.75;
  const scale = o.scale ?? 24;
  const cells = o.cells ?? 360;
  const fused = fusedPlaces(team);
  // They start in a row, or (o.ring, in group units) spread on a ring around where they will meet.
  const row = Object.fromEntries(
    team.map((n, i) => {
      if (!o.ring) return [n, { x: (i - (team.length - 1) / 2) * gap, y: 0, s: 1, m: 0 }];
      // A member bound for the middle (seven and up) comes in from below.
      const a = Math.hypot(fused[n].x, fused[n].y) < 0.05 ? Math.PI / 2 : Math.atan2(fused[n].y, fused[n].x);
      return [n, { x: Math.cos(a) * o.ring, y: Math.sin(a) * o.ring * 0.92, s: 1, m: 0 }];
    }),
  );
  const born = team.map((n, i) => (o.born ? o.born(i, n) : T + 260 + i * 80));
  const go = o.go ?? T + 1250;
  // k: 0 apart, 1 fused. A lean back, a rush in, a small overshoot.
  const k = { k: 0, m: 0 };
  tw(k, { k: [0, -0.07] }, go - 260, 260, E.soft);
  tw(k, { k: 1.05 }, go, 520, bez(0.7, 0, 0.6, 1));
  tw(k, { k: 1 }, go + 520, 600, E.spring(0.4, 12));
  tw(k, { m: [0, 1] }, go + 330, 520, E.io);
  const grow = E.spring(0.5);
  const placesAt = (t) => {
    const P = mixPlaces(row, fused, trackAt(k, "k", t), trackAt(k, "m", t));
    team.forEach((n, i) => (P[n].s *= Math.max(0.02, grow(clamp((t - born[i]) / 700)))));
    return P;
  };
  const blinks = Object.fromEntries(team.map((n, i) => [n, [born[i] + 620, go + 1050 + ((i * 410) % 1100), go + 2050 + ((i * 170) % 400)]]));
  melter(host, team, placesAt, { scale, cells, view: o.ring ? [0, 0, cells, cells] : [0, cells / 4, cells, cells / 2], cy: o.cy ?? -0.35, from: o.from ?? T - 100, to: o.to ?? T + 4200, blinks });
  const unit = (host.offsetWidth / cells) * scale;
  const mid = host.offsetLeft + host.offsetWidth / 2;
  const base = host.offsetTop + host.offsetHeight / 2;
  const tags = o.tags === false || o.ring ? [] : team.map((n, i) => add(root, `<div class="tag" style="left:${mid + row[n].x * unit - 150}px;top:${base + unit * 1.5}px;width:300px">${n}</div>`));
  tags.forEach((tag, i) => rise(tag, born[i] + 260, { d: 14, dur: 380 }));
  leave(tags, go - 220, { d: 0, dur: 180 });
  tw(host, { s: [1, o.zoom ?? 1.42] }, go, 900, E.io);
  tw(host, { sx: [1, 1.07], sy: [1, 0.93] }, go + 470, 110, E.soft);
  tw(host, { sx: 1, sy: 1 }, go + 580, 900, E.spring(0.3, 14));
  return {
    go,
    out(t) {
      tw(host, { o: 0 }, t + 120, 180, E.lin);
      tw(host, { s: (o.zoom ?? 1.42) * 0.8 }, t + 20, 280, E.in);
    },
  };
}

/** A crowd of pipkins that peek up out of the cells of a grid, rippling out from the middle. */
function crowdAct(grid, T, o) {
  const { cols, rows, names, hole } = o;
  let n = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (hole && r >= hole[1] && r <= hole[3] && c >= hole[0] && c <= hole[2]) continue;
      const cell = add(grid, `<div class="cell" style="grid-column:${c + 1};grid-row:${r + 1}"><div>${pipkin(names[n % names.length], { animate: true })}</div></div>`);
      const delay = Math.hypot(c - (cols - 1) / 2, (r - (rows - 1) / 2) * 1.3) * (o.ripple ?? 62) + rnd("crowd", "d" + n) * 160;
      const d = cell.offsetHeight * 1.1;
      tw(cell.firstElementChild, { y: [d, -10] }, T + 60 + delay, 300, E.soft);
      tw(cell.firstElementChild, { y: 0 }, T + 360 + delay, 420, E.spring(0.5));
      n++;
    }
}
const CROWD = ["theo", "omar", "lena", "juno", "zoe", "basil", "priya", "iris", "odin", "ines", "kofi", "ava", "rosa", "ezra", "mila", "otto", "sana", "leo", "ruby", "finn", "hugo", "nora", "tara", "max", "idris", "cleo", "felix", "kai", "mei", "noor", "ada", "linus", "grace", "alan", "sam", "alex", "jo", "@theo", "maya", "user_48213", "@maya", "7f3a-9c21", "may", "ma", "m", "maya@acme", "maya@a", "maya@ac"];
