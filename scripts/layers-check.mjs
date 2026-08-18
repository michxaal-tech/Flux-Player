// Static check on the drop-layer table.
//
// The table is the one place a theme's identity is data rather than code, and
// every failure mode here is silent: a theme with no entry quietly falls back to
// a generic set, a typo'd layer name draws nothing at all, and two themes
// sharing a list makes the feature feel repetitive without anything looking
// broken. None of it shows up in a render test.
//
// Usage: node scripts/layers-check.mjs
import { readFileSync } from "node:fs";

const constants = readFileSync("src/constants.ts", "utf8");
const layersSrc = readFileSync("src/visualizer/dropLayers.ts", "utf8");

const themes = constants
  .match(/export const VIS_THEMES = \[([\s\S]*?)\];/)[1]
  .match(/"[A-Z]+"/g)
  .map((s) => s.slice(1, -1));

const known = new Set([...layersSrc.matchAll(/^  ([A-Z]+): \(x\) => \{/gm)].map((m) => m[1]));
const table = {};
for (const m of layersSrc.matchAll(/^  ([A-Z]+): \[(.*?)\],$/gm)) {
  table[m[1]] = m[2].split(",").map((x) => x.trim().replace(/"/g, ""));
}

const problems = [];
for (const t of themes) if (!table[t]) problems.push(`${t}: no layer set — would fall back to the generic one`);
for (const [t, list] of Object.entries(table)) {
  if (!themes.includes(t)) problems.push(`${t}: has a layer set but is not in VIS_THEMES`);
  if (list.length !== 7) problems.push(`${t}: ${list.length} layers, expected 7`);
  for (const n of list) if (!known.has(n)) problems.push(`${t}: unknown layer "${n}"`);
  if (new Set(list).size !== list.length) problems.push(`${t}: repeats a layer`);
}
const seen = new Map();
for (const [t, list] of Object.entries(table)) {
  const key = list.join(">");
  if (seen.has(key)) problems.push(`${t} and ${seen.get(key)} have identical layer sets`);
  else seen.set(key, t);
}

const openers = new Set(Object.values(table).map((l) => l[0]));
console.log(`${Object.keys(table).length}/${themes.length} themes mapped, ${known.size} layers, ${openers.size} distinct opening layers`);
if (problems.length) {
  for (const p of problems) console.log(`  ✘ ${p}`);
  process.exit(1);
}
console.log("✔ every theme has its own set");
