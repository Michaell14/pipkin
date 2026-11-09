// Hashing. Every trait is addressed by (seed, key), so adding a trait later never
// moves the traits that already exist.

const utf8 = new TextEncoder();

/** 32-bit FNV-1a over UTF-8 bytes, finished with murmur3's fmix32 for avalanche. */
export function hash32(str) {
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
export const rnd = (seed, key) => hash32(seed + "\u0001" + key) / 4294967296;

/** 8 hex characters identifying a string, handy for tests and caches. */
export const fingerprint = (str) => hash32(str).toString(16).padStart(8, "0");

/** NFC, trimmed, lower-cased, inner whitespace collapsed. "Maya@Acme.co " and "maya@acme.co" agree. */
export function normalize(name) {
  return String(name ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
