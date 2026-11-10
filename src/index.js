// pipkins: deterministic animal avatars that breed and fuse. Zero dependencies.
//
//   pipkin("maya@acme.co")                       '<svg …>' one pipkin
//   pipkin("maya@acme.co", { animate: true })    the same pipkin, with idle motion (load pipkins/motion.css)
//   breed("maya", "theo", { child: 1 }).id       "maya×theo#1", and pipkin("maya×theo#1") draws that child
//   fuse(["maya", "theo", "zoe"])                one pipkin made of all three, in any order
//
// Same input, same output, with nothing stored.
import { genome, breed, share, TRAITS } from "./genome.js";
import { draw, MOODS } from "./render.js";
import { colourName } from "./color.js";
import { normalize, fingerprint } from "./hash.js";
import { MAX_MEMBERS } from "./geometry.js";
import { MOTION_CSS } from "./motion.js";

export const VERSION = "0.1.0";
export { genome, breed, share, TRAITS, MOODS, MOTION_CSS, MAX_MEMBERS, normalize, fingerprint };

/** One pipkin as an SVG string. `seed` is any name, id or email, a lineage like "a×b#2", or a genome. */
export function pipkin(seed, options) {
  return draw([genome(seed)], options);
}

/** One pipkin made of every member (up to 9). Order and duplicates do not matter. */
export function fuse(seeds, options) {
  const byId = new Map();
  for (const s of seeds ?? []) {
    const g = genome(s);
    byId.set(g.id, g);
  }
  const list = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_MEMBERS);
  if (!list.length) throw new TypeError("pipkins: fuse() needs at least one name");
  return draw(list, options);
}

/** A data: URI, for <img src>, CSS backgrounds and anywhere that wants a URL. */
export function pipkinUri(seed, options) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(pipkin(seed, options));
}

/** fuse() as a data: URI. */
export function fuseUri(seeds, options) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(fuse(seeds, options));
}

const EYE_WORDS = { dot: "dot eyes", big: "big eyes", wide: "wide eyes", happy: "happy eyes", line: "sleepy eyes" };

/** A short description for alt text, e.g. "teal bear with dot eyes". */
export function describe(seed) {
  const g = genome(seed).genes;
  const animal = g.species === "none" ? "pipkin" : g.species;
  return `${colourName(g.hue)} ${animal} with ${EYE_WORDS[g.eyes]}`;
}
