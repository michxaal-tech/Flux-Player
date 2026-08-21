// Is everything the app requires actually inside the package?
//
// This exists because an installer shipped that packaged cleanly, launched, and
// died on `Cannot find module './discord.cjs'` — the file was on disk, the app
// ran perfectly from the source directory, and electron-builder's `files` list
// named modules one by one and had never been told about it.
//
// launch-check.cjs cannot catch that. It boots the shell from the source
// directory, where every file exists by definition; packaging happens
// afterwards and is free to leave any of them out. So this reads the archive
// that actually ships and asks whether the things main.cjs and preload.cjs
// require are in it.
//
// Usage: node pack-check.cjs [path/to/app.asar]
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const asarPath = process.argv[2] || path.join(__dirname, "out", "win-unpacked", "resources", "app.asar");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

if (!existsSync(asarPath)) {
  console.log(`  ✗ no package found at ${asarPath}`);
  process.exit(1);
}

let listing = [];
try {
  listing = execFileSync("npx", ["--yes", "@electron/asar", "list", asarPath], {
    encoding: "utf8",
    shell: process.platform === "win32",
  })
    .split(/\r?\n/)
    .map((s) => s.replace(/^[/\\]/, "").replace(/\\/g, "/"))
    .filter(Boolean);
} catch (e) {
  console.log(`  ✗ could not read the package — ${e.message}`);
  process.exit(1);
}

const has = (f) => listing.includes(f.replace(/^\.\//, ""));

// Every local module the entry points pull in, found rather than listed: a
// hand-maintained list here would go stale the same way the packaging one did.
const required = new Set();
for (const entry of ["main.cjs", "preload.cjs"]) {
  const src = path.join(__dirname, entry);
  if (!existsSync(src)) continue;
  required.add(entry);
  const text = readFileSync(src, "utf8");
  for (const m of text.matchAll(/require\(\s*["'](\.\/[^"']+)["']\s*\)/g)) {
    required.add(m[1].replace(/^\.\//, ""));
  }
}

console.log(`\n${path.basename(asarPath)} — ${listing.length} entries\n`);
for (const f of [...required].sort()) {
  check(`${f} is packaged`, has(f), has(f) ? "" : "required by an entry point and missing");
}

check("the web build is packaged", has("app/index.html"), `${listing.filter((f) => f.startsWith("app/")).length} files under app/`);
check("its assets came too", listing.some((f) => f.startsWith("app/assets/") && f.endsWith(".js")));

console.log(failed ? `\n${failed} check(s) failed\n` : "\npackage contents ok\n");
process.exit(failed ? 1 : 0);
