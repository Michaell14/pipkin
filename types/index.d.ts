/** Anything that names a pipkin: a name, id or email, a lineage like "maya×theo#2", or a genome. */
export type Seed = string | Genome;

export type Species = "cat" | "fox" | "bear" | "mouse" | "bunny" | "none";
export type Body = "round" | "bean" | "pear" | "mochi" | "peanut";
export type Eyes = "dot" | "big" | "wide" | "happy" | "line";
export type Mood = "neutral" | "happy" | "sleepy" | "grumpy" | "worried" | "excited" | "determined" | "smug";
export type Background = "circle" | "squircle" | "square" | false;

export interface PipkinOptions {
  /** Sets width and height. Leave it out to size the SVG with CSS. */
  size?: number;
  /** A tinted shape behind the kit. Default: none (transparent). */
  background?: Background;
  /** Eye state. "neutral" (the default) uses the kit's own eyes. */
  mood?: Mood;
  /** Idle motion. Needs pipkin/motion.css on the page, or embedMotion. "hover" plays only while hovered. */
  animate?: boolean | "hover";
  /** Put the motion CSS inside the SVG, so it animates on its own (also as an <img>). */
  embedMotion?: boolean;
  /** Accessible name. Without it the SVG is aria-hidden. */
  title?: string;
}

export interface Genes {
  species: Species;
  body: Body;
  eyes: Eyes;
  hue: number;
  tone: number;
  chroma: number;
  size: number;
  eyeGap: number;
  eyeY: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
}

export interface Genome {
  /** The normalised name, or the lineage for a child ("maya×theo#1"). */
  readonly id: string;
  /** 0 for a name, 1 for a child, 2 for a grandchild… */
  readonly gen: number;
  readonly genes: Readonly<Genes>;
  /** For children: which parent each trait came from ("both", "mix" or "new" otherwise). */
  readonly from: Readonly<Record<string, string>> | null;
  readonly parents: readonly [string, string] | null;
}

export declare const VERSION: string;
export declare const MOODS: readonly Mood[];
export declare const MAX_MEMBERS: number;
export declare const MOTION_CSS: string;
export declare const TRAITS: Readonly<{
  species: { values: Species[]; weights: number[] };
  body: { values: Body[]; weights: number[] };
  eyes: { values: Eyes[]; weights: number[] };
}>;

/** One pipkin as an SVG string. */
export declare function pipkin(seed: Seed, options?: PipkinOptions): string;
/** One pipkin made of every member (up to MAX_MEMBERS). Order and duplicates do not matter. */
export declare function fuse(seeds: Iterable<Seed>, options?: PipkinOptions): string;
/** pipkin() as a data: URI for <img src>. */
export declare function pipkinUri(seed: Seed, options?: PipkinOptions): string;
/** fuse() as a data: URI. */
export declare function fuseUri(seeds: Iterable<Seed>, options?: PipkinOptions): string;
/** A child of two kits. Parent order does not matter; `child` picks a sibling. */
export declare function breed(a: Seed, b: Seed, options?: { child?: number }): Genome;
export declare function genome(seed: Seed): Genome;
/** Alt text, e.g. "teal bear with dot eyes". */
export declare function describe(seed: Seed): string;
/** Share of all names that get a trait value, e.g. share("species", "fox") === 0.16. */
export declare function share(trait: "species" | "body" | "eyes", value: string): number;
export declare function normalize(name: string): string;
export declare function fingerprint(str: string): string;
