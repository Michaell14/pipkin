// The scenes the cuts are composed from. Each one builds its own markup inside a 1920 x 1080 box,
// schedules itself from a start time T, and returns { out(t) } if it can leave on its own.
// A box is either a scene on the open stage (act) or the inside of a sliding colour panel (panel).

const HERO = "maya@acme.co";
// A sleeping grey blob stands in until there is a name.
const GHOST = "\u0000ghost";
const ghost = (o, [body, tint, ink] = ["#c9cfe2", "#e6e9f3", "#5d6582"]) => {
  const c = palette(genome("ruby").genes);
  return pipkin("ruby", { ...o, mood: "sleepy" }).replaceAll(c.body, body).replaceAll(c.tint, tint).replaceAll(c.ink, ink);
};
const faceOf = (who, o) => (who === GHOST ? ghost(o) : pipkin(who, o));
/** A full-bleed pastel in a name's own hue (lightness, chroma, hue), and a dark tone of it for type. */
const washOf = (name) => (name === GHOST ? [0.925, 0.012, 275] : [0.9, 0.06, genome(name).genes.hue]);
const wash = (name) => oklch(...washOf(name));
const deep = (name) => (name === GHOST ? "#5d6582" : oklch(0.44, 0.13, genome(name).genes.hue));
const NAMELESS = wash(GHOST);
/**
 * The wash for a [[time, name], …] timeline. A change of name turns the hue the short way round
 * the wheel over two or three frames: enough to soften the cut, and never grey in between.
 */
const washAt = (cast, t, fade = 40) => {
  let i = 0;
  while (i + 1 < cast.length && cast[i + 1][0] <= t) i++;
  const b = washOf(cast[i][1]);
  const k = i ? clamp((t - cast[i][0]) / fade) : 1;
  if (k >= 1) return oklch(...b);
  const a = washOf(cast[i - 1][1]);
  // The nameless grey has no hue of its own: it takes the hue it is heading for.
  const from = a[1] < 0.02 ? b[2] : a[2];
  return oklch(mix(a[0], b[0], k), mix(a[1], b[1], k), (from + (((b[2] - from + 540) % 360) - 180) * k + 360) % 360);
};
const stamp = (node, t, from = 0.86) => {
  tw(node, { o: [0, 1] }, t, 70, E.lin);
  tw(node, { s: [from, 1] }, t, 520, E.spring(0.5));
};
const brandFill = (root) => {
  for (const logo of $$(".logo", root)) logo.innerHTML = pipkin("maya");
  for (const name of $$(".name", root)) name.textContent = CFG.brand;
};
const say = (text, lower) => (lower ? text.toLowerCase() : text);

// ---------------------------------------------------------------- boxes

/** A scene on the open stage, shown from T for dur. */
function act(T, dur, cls = "") {
  const box = add($("#stage"), `<section class="scene ${cls}"></section>`);
  scene(box, T, T + dur);
  return box;
}
/** A full-bleed panel that slides up over whatever is showing; returns its 1920 x 1080 inside. */
function panel(T, until, o = {}) {
  const p = add($("#stage"), `<section class="panel ${o.cls ?? ""}"><div class="in"></div></section>`);
  if (o.bg) p.style.background = o.bg;
  scene(p, T - 20, until + 520);
  if (o.slide !== false) tw(p, { y: [1200, 0] }, T, 480, E.out);
  return p.firstElementChild;
}

// ---------------------------------------------------------------- the tour's scenes

/**
 * Type a name into pipkin("…") and the face changes on every keystroke; then a username, an id
 * and a printer are pasted in. With o.wash the whole panel takes each face's colour.
 */
function typeScene(box, T, o = {}) {
  const until = o.until ?? T + 4600;
  box.classList.add("sc", "sc-type");
  if (o.wash) box.classList.add("washed");
  add(box, `<div class="brand"><span class="logo"></span><span class="name"></span></div>`);
  add(box, `<h1>${say("Anything with a name<br>gets a face.", o.lower)}</h1>`);
  const field = add(box, `<div class="field"><span>pipkin</span><span class="p">("</span><span class="typed"></span><span class="caret"></span><span class="p">")</span></div>`);
  const kindsBox = add(box, `<div class="kinds">${["email", "username", "id", "anything"].map((k) => `<div class="kind"><span>${k}</span></div>`).join("")}</div>`);
  const faceBox = add(box, `<div class="pk face"></div>`);
  const says = add(box, `<div class="says"></div>`);
  brandFill(box);
  const keys = keystrokes(HERO, T + 420, { cps: 10.5, seed: "tour" });
  const typedDone = keys[keys.length - 1];
  // After the email: a username, an id, and something that is not a person at all.
  const pastes = [[typedDone + 1050, "@theo"], [typedDone + 1620, "user_48213"], [typedDone + 2190, "office printer"]];
  const textAt = (t) => {
    let text = HERO.slice(0, typedAt(keys, t));
    for (const [at, value] of pastes) if (t >= at) text = value;
    return text;
  };
  const face = hero(faceBox, GHOST, { background: o.wash ? undefined : "squircle", render: faceOf });
  keys.forEach((k, i) => face.name(k, HERO.slice(0, i + 1)));
  pastes.forEach(([at, value]) => face.name(at, value));
  face.hop(typedDone + 260, 46).blink(typedDone + 760, pastes[0][0] + 300, pastes[1][0] + 330, pastes[2][0] + 280, pastes[2][0] + 800);
  face.twitch(pastes[2][0] + 520);
  const typed = $(".typed", box);
  const caret = $(".caret", box);
  $$(".kind", box).forEach((k, i) => {
    const from = [keys[0], pastes[0][0], pastes[1][0], pastes[2][0]][i];
    const to = [pastes[0][0], pastes[1][0], pastes[2][0], 1e9][i];
    tw(k, { on: [0, 1] }, from, 160, E.soft);
    if (to < 1e9) tw(k, { on: 0 }, to, 160, E.soft);
    on((t) => (k.style.color = t >= from + 60 && t < to + 60 ? "#fff" : ""));
  });
  const cast = [[-1e9, GHOST], ...keys.map((k, i) => [k, HERO.slice(0, i + 1)]), ...pastes];
  on((t) => {
    if (t < T || t > until) return;
    const text = textAt(t);
    typed.textContent = text;
    typed.style.color = text ? oklch(0.52, 0.13, genome(text).genes.hue) : "";
    const busy = t >= keys[0] - 80 && t <= typedDone + 250;
    caret.style.opacity = busy || Math.floor((t - typedDone) / 420) % 2 === 0 ? 1 : 0;
    says.textContent = text ? describe(text) : "no name yet";
    if (o.wash) box.parentNode.style.background = washAt(cast, t);
  });
  // Each paste lands with a small bump of the field.
  pastes.forEach(([at]) => {
    tw(field, { s: [1, 1.025] }, at, 70, E.soft);
    tw(field, { s: 1 }, at + 70, 380, E.spring(0.45));
  });
  const hw = words($("h1", box));
  return {
    out(t) {
      headlineOut(hw, t);
      leave([$(".brand", box), field, kindsBox], t + 20, { d: 30, gap: 30 });
      unpop([faceBox], t + 60);
      leave([says], t, { d: 20 });
    },
  };
}

/** An app where one name's face turns up in three places at once, then: no storage, no uploads. */
function appScene(box, T, o = {}) {
  box.classList.add("sc", "sc-app");
  if (o.lower) box.classList.add("lower");
  add(box, `<div class="cap"><h1>Same input, same avatar. Forever.</h1></div>`);
  const app = add(box, `<div class="app"><div class="side"><div class="kicker">MEMBERS</div></div><div class="main"><div class="bar"><span># design-crew</span><div class="stack"></div></div><div class="msgs"></div></div></div>`);
  const proof = add(box, `<div class="proof"><div>No storage. No uploads.</div></div>`).firstElementChild;
  const people = [[HERO, "maya", "Online"], ["omar", "omar", "Online"], ["lena", "lena", "Focusing", "determined"], ["cleo", "cleo", "Away", "sleepy"]];
  const av = (seed, mood) => `<div class="av">${pipkin(seed, { background: "circle", mood })}</div>`;
  const rows = people.map(([seed, name, status, mood]) => add($(".side", app), `<div class="row">${av(seed, mood)}<div><b>${name}</b><i>${status}</i></div></div>`));
  const stack = [HERO, "omar", "lena", "cleo"].map((seed) => add($(".stack", app), av(seed)));
  const msgs = [["omar", "omar", "10:02", [80, 48]], [HERO, "maya", "10:04", [62, 34]]].map(([seed, name, time, bars]) =>
    add($(".msgs", app), `<div class="msg">${av(seed)}<div style="flex:1"><b>${name}</b><i>${time}</i><div class="bars">${bars.map((w) => `<span style="width:${w}%"></span>`).join("")}</div></div></div>`),
  );
  const hw = headline($(".cap h1", box), T + 60);
  rise(app, T + 120, { d: 90, dur: 800 });
  rise(rows, T + 380, { d: 26, gap: 80, dur: 520 });
  pop(stack, T + 520, { gap: 80, dur: 520 });
  msgs.forEach((m, i) => {
    rise(m, T + 800 + i * 380, { d: 30, dur: 520 });
    pop($(".av", m), T + 800 + i * 380, { dur: 620, from: 0.2 });
  });
  // The same name drew the same face in three places: ring them together.
  const beat = T + 1780;
  for (const a of [$(".av", rows[0]), stack[0], $(".av", msgs[1])]) {
    const ring = add(a, `<div class="ring"></div>`);
    tw(ring, { o: [0, 1] }, beat, 140, E.lin);
    tw(ring, { s: [1.5, 1] }, beat, 520, E.spring(0.55));
    tw(a, { s: [1, 1.22] }, beat, 130, E.soft);
    tw(a, { s: 1 }, beat + 130, 600, E.spring(0.4));
  }
  pop(proof, T + 2140, { dur: 700, from: 0.6, z: 0.48 });
  return {
    out(t) {
      headlineOut(hw, t);
      leave(app, t + 30, { d: 50 });
      unpop(proof, t);
    },
  };
}

// A headline with the call under it, as the tour's breed, fuse and mood scenes have.
function caption(box, T, title, code, lower) {
  const cap = add(box, `<div class="cap"><h1>${say(title, lower)}</h1><div class="code">${code}</div></div>`);
  const hw = headline($("h1", cap), T);
  rise($(".code", cap), T + 140, { d: 24, dur: 500 });
  return (t) => {
    headlineOut(hw, t);
    leave($(".code", cap), t, { d: -16 });
  };
}

/** Two parents and their four children, under a headline. */
function breedScene(box, T, o = {}) {
  box.classList.add("sc", "sc-breed");
  const capOut = caption(box, T, "Breed two.", `breed(<b>"rosa"</b>, <b>"priya"</b>)`, o.lower);
  const family = breedAct(box, T, { a: "rosa", b: "priya", w: 1920, h: 1080, cx: 960, py: 448, pd: 300, half: 250, kids: 4, ky: 830, kd: 250, kstep: 320 });
  return {
    out(t) {
      capOut(t);
      family.out(t);
    },
  };
}

/** Five in a row melt into one. */
function fuseScene(box, T, o = {}) {
  box.classList.add("sc", "sc-fuse");
  const team = ["zoe", "omar", "iris", "lena", "theo"];
  const capOut = caption(box, T, "Fuse a team.", `fuse([${team.map((n) => `<b>"${n}"</b>`).join(", ")}])`, o.lower);
  const melt = fuseAct(box, add(box, `<div class="melt"></div>`), T, { team, to: o.until ?? T + 3900 });
  return {
    out(t) {
      capOut(t);
      melt.out(t);
    },
  };
}

/** One face in close-up, flicking through moods. */
function moodScene(box, T, o = {}) {
  box.classList.add("sc", "sc-mood");
  const capOut = caption(box, T, "Set a mood.", `pipkin(<b>"${HERO}"</b>, { mood })`, o.lower);
  const tile = add(box, `<div class="moody"><div class="pk"></div></div>`);
  const label = add(box, `<div class="mood"><div></div></div>`).firstElementChild;
  tile.style.background = o.tile ?? palette(genome(HERO).genes).tint;
  const h = hero($(".pk", tile), HERO);
  pop(tile, T + 120, { dur: 700 });
  pop(label, T + 260, { dur: 600, from: 0.6 });
  const moods = [[T + 560, "happy"], [T + 940, "sleepy"], [T + 1320, "grumpy"], [T + 1700, "smug"]];
  moods.forEach(([t, m]) => h.mood(t, m));
  on((t) => (label.textContent = `"${latest([[-1e9, "neutral"], ...moods], t)[1]}"`));
  moods.forEach(([t]) => {
    tw(label, { s: 1.07 }, t, 60, E.soft);
    tw(label, { s: 1 }, t + 60, 300, E.spring(0.5));
  });
  h.blink(T + 380);
  return {
    out(t) {
      capOut(t);
      unpop([tile, label], t + 20, { gap: 40 });
    },
  };
}

/** The end card: the name, the line and the install command, with a crowd peeking up around it. */
function cardEnd(box, T, o = {}) {
  box.classList.add("sc", "sc-card");
  const grid = add(box, `<div class="grid"><div class="card"><div class="mark"><span class="logo"></span><span class="name"></span></div><div class="line">${say("There's one for everyone.", o.lower)}</div><div class="cmd">${CFG.install}</div><div class="facts">Zero dependencies · ${CFG.kb} KB gzipped</div></div></div>`);
  brandFill(box);
  crowdAct(grid, T, { cols: 11, rows: 6, hole: [2, 1, 8, 4], names: CROWD });
  const card = $(".card", box);
  tw(card, { o: [0, 1] }, T + 200, 260, E.soft);
  tw(card, { y: [60, 0], s: [0.94, 1] }, T + 200, 800, E.spring(0.62, 11));
  pop($(".mark", box), T + 420, { dur: 700, from: 0.7 });
  rise($(".line", box), T + 560, { d: 26, dur: 560 });
  pop($(".cmd", box), T + 760, { dur: 700, from: 0.6 });
  rise($(".facts", box), T + 960, { d: 18, dur: 500 });
}

// ---------------------------------------------------------------- the pop cut's scenes

/**
 * "hi, cleo." A giant face, its name in giant type, and the panel in its colour; then a hard cut
 * to the next name. With o.typed the first name is typed, the face changing on every keystroke.
 */
function hiScene(box, T, o = {}) {
  const until = o.until ?? T + 3250;
  box.classList.add("pp-hi");
  const faceBox = add(box, `<div class="pk face"></div>`);
  const line = add(box, `<h1 class="big"><span><span>hi, </span><span class="who"></span>${o.typed ? `<span class="caret"></span>` : ""}<span>.</span></span></h1>`);
  const code = add(box, `<div class="chip"><div></div></div>`).firstElementChild;
  const who = $(".who", line);
  // A name, an email, a username, an id, a key: anything.
  let cast;
  let cuts;
  let keys = [];
  if (o.typed) {
    keys = keystrokes(HERO, T + 400, { cps: 10.5, seed: "hi" });
    const done = keys[keys.length - 1];
    cuts = [[done + 980, "@theo"], [done + 1530, "user_48213"], [done + 2080, "7f3a-9c21"]];
    cast = [[-1e9, GHOST], ...keys.map((k, i) => [k, HERO.slice(0, i + 1)]), ...cuts];
  } else {
    cuts = [[T + 820, HERO], [T + 1420, "@theo"], [T + 1900, "user_48213"], [T + 2270, "7f3a-9c21"]];
    cast = [[-1e9, "cleo"], ...cuts];
  }
  const face = hero(faceBox, cast[0][1], { render: faceOf });
  cast.slice(1).forEach(([t, n]) => face.name(t, n));
  if (o.typed) face.hop(keys[keys.length - 1] + 250, 54).blink(keys[keys.length - 1] + 720, cuts[0][0] + 330, cuts[2][0] + 300);
  else face.hop(T + 140, 50).blink(T + 520, T + 1180);
  // Long names shrink to fit the frame. While typing, the line keeps the size of the finished name.
  const size = new Map();
  for (const name of [...cuts.map((c) => c[1]), HERO, ...(o.typed ? [] : [cast[0][1]])]) {
    who.textContent = name;
    size.set(name, Math.min(200, (200 * 1600) / line.firstElementChild.offsetWidth));
  }
  const caret = $(".caret", line);
  on((t) => {
    if (t > until) return;
    const name = latest(cast, t)[1];
    box.parentNode.style.background = o.typed ? washAt(cast, t) : wash(name);
    line.style.fontSize = (size.get(name) ?? size.get(HERO)).toFixed(1) + "px";
    who.textContent = name === GHOST ? "" : name;
    who.style.color = deep(name);
    code.textContent = `pipkin("${name === GHOST ? "" : name}")`;
    if (caret) {
      const last = keys[keys.length - 1];
      const busy = t >= keys[0] - 80 && t <= last + 250;
      caret.style.display = t < cuts[0][0] ? "" : "none";
      caret.style.opacity = busy || Math.floor((t - last) / 420) % 2 === 0 ? 1 : 0;
    }
  });
  cuts.forEach(([t]) => {
    tw(line, { s: [0.9, 1] }, t, 420, E.spring(0.45));
    tw(faceBox, { s: [0.84, 1] }, t, 460, E.spring(0.42));
  });
}

/** A wall of 144 faces ripples in, and the claim lands on top of it. */
function wallScene(box, T) {
  box.classList.add("pp-wall");
  const wall = add(box, `<div class="wall"></div>`);
  const claim = add(box, `<div class="claim"><div>anything with a name<br>gets a face.</div></div>`).firstElementChild;
  const cells = [];
  for (let i = 0; i < 144; i++) {
    const far = Math.hypot((i % 16) - 7.5, (Math.floor(i / 16) - 4) * 1.2);
    const cell = add(wall, `<div>${pipkin(i < CROWD.length ? CROWD[i] : "user_" + (1000 + i * 37))}</div>`);
    tw(cell, { s: [0, 1] }, T + 120 + far * 34 + rnd("wall", "d" + i) * 110, 560, E.spring(0.5));
    cells.push([cell, far]);
  }
  tw(wall, { s: [1.12, 1] }, T, 2600, E.soft);
  stamp(claim, T + 520, 0.7);
  return {
    // The wall drains from the edges in, leaving the bare stage.
    out(t) {
      unpop(claim, t, { dur: 220 });
      for (const [cell, far] of cells) tw(cell, { s: 0 }, t + (9 - far) * 16, 240, E.in);
    },
  };
}

/** same input. / same avatar. / forever. One face, then three, then a row off both edges. */
function sameScene(box, T) {
  box.classList.add("pp-same");
  box.parentNode.style.background = wash(HERO);
  const lines = ["same input.", "same avatar.", "forever."].map((text) => add(box, `<h1 class="big">${text}</h1>`));
  const code = add(box, `<div class="chip"><div>pipkin("${HERO}")</div></div>`).firstElementChild;
  const proof = add(box, `<div class="chip proof"><div>no storage. no uploads.</div></div>`).firstElementChild;
  const beats = [T + 180, T + 820, T + 1460];
  lines.forEach((l, i) => {
    stamp(l, beats[i]);
    if (i < 2) tw(l, { o: 0 }, beats[i + 1], 1, E.lin);
  });
  const xs = [0, -450, 450, -830, 830, -1120, 1120];
  const ds = [450, 380, 380, 310, 310, 240, 240];
  const faces = xs.map((x, i) => spot(box, 960 + x, 610, ds[i], HERO));
  faces.forEach((f, i) => {
    const beat = beats[i === 0 ? 0 : i < 3 ? 1 : 2] + (i > 2 ? (i > 4 ? 90 : 30) : 0);
    pop(f.wrap, beat, { dur: 620, from: 0.2 });
    // Identical faces move as one: a wave, then a blink together.
    f.h.hop(beats[2] + 420 + Math.abs(xs[i]) * 0.22, 54, 380).blink(beats[0] + 420, beats[2] + 1250);
  });
  stamp(code, beats[0] + 120, 0.7);
  tw(code, { o: 0 }, beats[2] + 300, 120, E.lin);
  stamp(proof, beats[2] + 420, 0.7);
}

/** they breed. */
function popBreed(box, T) {
  box.classList.add("pp-breed");
  box.parentNode.style.background = oklch(0.915, 0.05, genome("rosa×priya#1").genes.hue);
  const big = add(box, `<h1 class="big">they breed.</h1>`);
  const code = add(box, `<div class="chip"><div>breed("rosa", "priya")</div></div>`).firstElementChild;
  stamp(big, T + 160);
  breedAct(box, T + 120, { a: "rosa", b: "priya", w: 1920, h: 1080, cx: 960, py: 450, pd: 310, half: 265, kids: 4, ky: 800, kd: 250, kstep: 330, tags: false });
  stamp(code, T + 900, 0.7);
}

/** they fuse. Seven come in from a ring, on a dark panel. */
function popFuse(box, T, o = {}) {
  box.classList.add("pp-fuse");
  const big = add(box, `<h1 class="big">they fuse.</h1>`);
  const melt = add(box, `<div class="melt"></div>`);
  const code = add(box, `<div class="chip light"><div>fuse(team)</div></div>`).firstElementChild;
  stamp(big, T + 160);
  const team = ["zoe", "omar", "iris", "lena", "theo", "juno", "ezra"];
  fuseAct(box, melt, T, { team, ring: 3.85, cells: 320, scale: 30, cy: 0, zoom: 1.68, born: (i) => T + 240 + i * 70, go: T + 1320, to: o.until ?? T + 4400 });
  stamp(code, T + 2250, 0.7);
}

/** they have moods. A close-up beside the mood in giant type. */
function popMood(box, T) {
  box.classList.add("pp-mood");
  box.parentNode.style.background = wash(HERO);
  const close = add(box, `<div class="close"><div class="pk"></div></div>`);
  const sayIt = add(box, `<div class="say">they have moods.</div>`);
  const word = add(box, `<div class="word"></div>`);
  const code = add(box, `<div class="chip"><div></div></div>`).firstElementChild;
  close.style.background = palette(genome(HERO).genes).tint;
  const h = hero($(".pk", close), HERO);
  const moods = [[T + 140, "happy"], [T + 700, "sleepy"], [T + 1240, "grumpy"], [T + 1780, "smug"]];
  moods.forEach(([t, m]) => h.mood(t, m, t > T + 200));
  word.style.color = deep(HERO);
  on((t) => {
    const mood = latest([[-1e9, "happy"], ...moods], t)[1];
    word.textContent = mood + ".";
    code.textContent = `{ mood: "${mood}" }`;
  });
  moods.forEach(([t]) => tw(word, { s: [0.86, 1] }, t, 460, E.spring(0.42)));
  stamp(close, T + 140, 0.8);
  stamp(sayIt, T + 200, 0.9);
  stamp(code, T + 320, 0.7);
}

/** The dark end card: a giant wordmark, the install command, and a row peeking over the bottom edge. */
function popEnd(box, T) {
  box.classList.add("pp-end");
  const mark = add(box, `<div class="mark"><span class="logo"></span><span class="name"></span></div>`);
  const line = add(box, `<div class="line">there's one for everyone.</div>`);
  const cmd = add(box, `<div class="chip light"><div>${CFG.install}</div></div>`).firstElementChild;
  const facts = add(box, `<div class="facts">zero dependencies · ${CFG.kb} KB gzipped</div>`);
  const row = add(box, `<div class="row"></div>`);
  brandFill(box);
  stamp(mark, T + 240, 0.8);
  rise(line, T + 460, { d: 30, dur: 560 });
  stamp(cmd, T + 680, 0.7);
  rise(facts, T + 900, { d: 20, dur: 500 });
  ["theo", "omar", "lena", "zoe", "iris", "juno", "ezra", "priya", "basil", "cleo", "ines", "rosa", "kofi"].forEach((n, i) => {
    const cell = add(row, `<div class="pk" style="left:${960 + (i - 6) * 152 - 105}px">${pipkin(n, { animate: true })}</div>`);
    const delay = Math.abs(i - 6) * 55 + rnd("row", "d" + i) * 90;
    tw(cell, { y: [240, -22] }, T + 420 + delay, 300, E.soft);
    tw(cell, { y: 0 }, T + 720 + delay, 480, E.spring(0.45));
  });
}
