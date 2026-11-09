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
export function oklch(L, C, H) {
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
export function palette(genes) {
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
export function groupPalette(hues) {
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
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const NAMES = [
  [18, "rose"], [45, "coral"], [72, "peach"], [98, "butter"], [118, "lemon"], [145, "lime"],
  [172, "mint"], [205, "teal"], [235, "sky"], [262, "blue"], [288, "periwinkle"], [318, "lilac"],
  [342, "orchid"], [360, "pink"],
];
/** A plain colour word for a hue, for alt text. */
export function colourName(hue) {
  for (const [limit, name] of NAMES) if (hue < limit) return name;
  return "rose";
}
