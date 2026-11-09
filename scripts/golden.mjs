// Regenerate test/golden.json. Only run this when a change to how kits look is intended;
// such a change belongs in a new major version, because every existing avatar moves.
import { writeFileSync } from "node:fs";
import { cases } from "../test/cases.mjs";
import { fingerprint } from "../src/index.js";

const out = {};
for (const [key, render] of Object.entries(cases)) out[key] = fingerprint(render());
writeFileSync(new URL("../test/golden.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} golden fingerprints`);
