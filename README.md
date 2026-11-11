# pipkin

Deterministic animal avatars that breed and fuse. Zero dependencies, about 2 KB of SVG per avatar.

```js
import { pipkin } from "pipkin";

avatar.innerHTML = pipkin(user.email, { size: 40, background: "circle" });
```

Every name gets a **pipkin**: a small flat animal (cat, fox, bear, mouse, bunny, or an earless blob) with ink eyes. The same name always draws the same pipkin, and nothing is stored. On top of that:

- **Breeding.** `breed("maya", "theo")` gives a child that takes its traits from both parents. The child's id is its lineage (`"maya×theo#0"`), and that string is a valid name anywhere.
- **Fusing.** `fuse(["maya", "theo", "iris"])` draws one pipkin for a whole team: members melt into one body, each keeping their colour, their ears and one eye.
- **Motion.** `animate: true` adds a quiet idle loop (breathing, a small bob, blinks, ear twitches), and every moving part is exposed for your own CSS.

## Install

```sh
npm install pipkin
```

It is plain ES modules with TypeScript types: no build step and no dependencies. Without a bundler, import it from a CDN:

```js
import { pipkin } from "https://cdn.jsdelivr.net/npm/pipkin@0/dist/pipkin.min.js";
```

## Usage

**Any framework.** `pipkin()` returns an SVG string.

```jsx
// React
<span className="avatar" dangerouslySetInnerHTML={{ __html: pipkin(user.id, { size: 32 }) }} />
```

```html
<!-- Vue -->
<span class="avatar" v-html="pipkin(user.id, { size: 32 })"></span>
```

**Where you need a URL** (an `<img>` or a CSS background):

```js
img.src = pipkinUri(user.email, { background: "circle" });
```

**Alt text:**

```js
describe("maya@acme.co"); // "teal bunny with dot eyes"
pipkin("maya@acme.co", { title: "Maya Chen" }); // role="img" with a <title>; otherwise aria-hidden
```

## API

| Function | Returns | Notes |
| --- | --- | --- |
| `pipkin(seed, options?)` | SVG string | One pipkin. A seed is any name, id or email, a lineage, or a genome. |
| `fuse(seeds, options?)` | SVG string | One pipkin for up to 9 members. Order and duplicates are ignored. |
| `breed(a, b, { child? })` | genome | Order-free. `child` picks a sibling (0, 1, 2…). |
| `pipkinUri`, `fuseUri` | data URI | The same, ready for `src` attributes. |
| `describe(seed)` | string | Alt text. |
| `genome(seed)` | genome | `{ id, gen, genes, from, parents }`. `from` says which parent each trait came from. |
| `share(trait, value)` | number | How common a trait value is, e.g. `share("species", "fox")` is `0.16`. |

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `size` | none | Sets `width` and `height`. Leave it out to size with CSS. |
| `background` | `false` | `"circle"`, `"squircle"` or `"square"`, in a pale tint of the pipkin's colour. |
| `mood` | `"neutral"` | `happy`, `sleepy`, `grumpy`, `worried`, `excited`, `determined`, `smug`. Expressed with eyelids only. |
| `animate` | `false` | `true`, or `"hover"` to play only while hovered. |
| `embedMotion` | `false` | Puts the motion CSS inside the SVG, so it animates on its own, even as an `<img>`. |
| `title` | none | Accessible name. |

Bad values throw a `TypeError` that names the accepted ones.

## Breeding

```js
const kid = breed("maya", "theo", { child: 1 });
kid.id; // "maya×theo#1"
kid.from; // { species: "theo", body: "theo", eyes: "theo", hue: "mix" }
pipkin("maya×theo#1") === pipkin(kid); // true
breed(kid, "zoe").id; // "(maya×theo#1)×zoe#0"
```

Each child takes its species, body and eyes from one parent or the other (6% chance per trait of something new). Colour blends along the hue wheel unless the parents' colours clash, in which case the child takes one parent's colour. Proportions blend.

## Fusing

```js
fuse(["maya", "theo", "iris"]) === fuse(["iris", "theo", "maya", "maya"]); // true
```

Members are sorted, placed in a ring and traced as one metaball body with a clean gap between members. Ears appear where a member's head reaches the top. Past nine members, the first nine in sorted order are kept.

## Motion

Animation needs the SVG inline in the page and the motion styles loaded once:

```js
import "pipkin/motion.css";
el.innerHTML = pipkin(user.id, { animate: true });
```

Every moving part sits in its own group, with its pivot at the group's origin:

| Part | Pivot | Default motion | Timing variables |
| --- | --- | --- | --- |
| `.pipkin-bob` | whole pipkin | drifts up and down by under a pixel | `--pipkin-bob`, `--pipkin-delay` |
| `.pipkin-breathe` | bottom of the body | squashes 1–2% and back | `--pipkin-breathe`, `--pipkin-delay` |
| `.pipkin-ear-l`, `.pipkin-ear-r` | base of each ear | an occasional twitch | `--pipkin-twitch`, `--pipkin-twitch-delay` |
| `.pipkin-eye` | centre of each eye | a blink every few seconds | `--pipkin-blink`, `--pipkin-blink-delay` |

The timing variables are set per pipkin (and per member in a group), so a crowd never moves in step. Motion stops under `prefers-reduced-motion`. Adding your own is plain CSS:

```css
.avatar:hover .pipkin-ear-l { animation: wave-l 0.5s 2; }
.avatar:hover .pipkin-ear-r { animation: wave-r 0.5s 2; }
@keyframes wave-l { 50% { transform: rotate(-24deg); } }
@keyframes wave-r { 50% { transform: rotate(24deg); } }
```

Moods double as states: switch `mood` to `"sleepy"` for away, `"determined"` for focus.

## Guarantees

- **Deterministic.** The same input gives the same SVG, byte for byte. `test/golden.json` pins 41 renders.
- **Normalised names.** Inputs are NFC-normalised, trimmed, lower-cased and whitespace-collapsed before hashing, and hashed as UTF-8.
- **Stable traits.** Each trait is hashed by its own key, so adding a trait never moves existing ones. Anything that changes how existing pipkins look (trait tables, ranges, shapes) is a major version.
- **Legible.** Eyes clear 6.8:1 contrast against every body colour (tested at every hue). Pipkins are checked down to 16 px.
- **Safe to repeat.** No ids, `<defs>`, gradients or filters, so hundreds of pipkins can share a page.

## Size

`dist/pipkin.min.js` is about 8.4 KB gzipped, with no dependencies. A static pipkin is about 2 KB of SVG; a fused group of nine is under 12 KB.

## Development

```sh
npm install        # only esbuild, for the minified build
npm test           # node --test
npm run build      # dist/, src/motion.css, docs/index.html and docs/examples.html
npm run golden     # re-pin test/golden.json (only for intended visual changes)
npm run og         # re-render the share preview, docs/og/ (needs Playwright and ffmpeg)
npm run demo       # re-render the demo videos, docs/demo/ (needs Playwright and ffmpeg)
```

`npm run demo` renders six 20-second cuts and a 10-second `teaser` at 1080p60. Three are the originals: `tour` (light, the site's look), `code` (dark, an editor with each call playing out beside it) and `pop` (full-bleed colour and big type). Three blend `tour` and `pop`: `tour-pop` (the tour's script on colour panels), `pop-tour` (the pop opening and end card around the tour's walkthrough) and `type-pop` (the pop cut, opening on a name typed live).

Pass names to render only some (`npm run demo -- pop`), and `--stills=1.5,12` to write single frames instead of a video. Each cut is one short page in `scripts/demo/` that lines up scenes from `scripts/demo/scenes.js`, which is built on the small timeline kit in `scripts/demo/kit.js`.

## Not done yet

- Byte-identical output is verified in Node and Chromium; other engines could round a coordinate differently.
- Framework components. The SVG string works in all of them today.
- More motion: gaze tracking and transitions between moods.
