// Renders pinned by test/golden.json. Each one must stay byte-for-byte identical within a major version.
import { pipkin, fuse } from "../src/index.js";

const NAMES = ["maya", "theo", "iris", "omar", "lena", "kofi", "jun", "sam", "zoe", "priya", "noah", "ava", "ines", "dev", "rosa", "ezra", "日本語", "🦊", "maya@acme.co"];

export const cases = {};
for (const n of NAMES) cases[`pipkin:${n}`] = () => pipkin(n);
for (const k of [0, 1, 2, 3]) cases[`child:maya×theo#${k}`] = () => pipkin(`maya×theo#${k}`);
cases["grandchild"] = () => pipkin("(maya×theo#1)×zoe#0");
for (const n of [2, 3, 5, 9]) cases[`fuse:${n}`] = () => fuse(NAMES.slice(0, n));
for (const mood of ["happy", "sleepy", "grumpy", "worried", "excited", "determined", "smug"]) cases[`mood:${mood}`] = () => pipkin("lena", { mood });
for (const background of ["circle", "squircle", "square"]) cases[`bg:${background}`] = () => pipkin("iris", { background });
cases["animated"] = () => pipkin("omar", { animate: true });
cases["animated-group"] = () => fuse(["maya", "theo", "iris"], { animate: "hover" });
cases["titled"] = () => pipkin("kofi", { size: 48, title: "Kofi" });
