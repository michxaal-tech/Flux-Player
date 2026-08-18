// Checks every Discover source against the live service.
//
// These are other people's APIs and they change without telling anyone, so each
// source is asserted the same way: a search returns usable rows, a browse chip
// returns usable rows, and the audio URL of the first row really is audio a
// browser could fetch — the header that matters is access-control-allow-origin,
// since without it the row is unimportable no matter how good the metadata is.
//
// Run: node scripts/catalogue-check.mjs [sourceId]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "https://michxaal-tech.github.io";
const tmp = mkdtempSync(join(tmpdir(), "cat-"));

// Sources are compiled out of src so this can never drift from what ships.
execFileSync("node_modules/.bin/esbuild", [
  "src/sources.ts", "--bundle", "--format=esm", `--outfile=${join(tmp, "sources.mjs")}`,
], { stdio: "inherit" });
const { SOURCES } = await import(join(tmp, "sources.mjs"));

function curl(url, extra = []) {
  const out = join(tmp, "out.bin");
  execFileSync("curl", ["-sS", "-m", "45", "-L", "-D", join(tmp, "hdr.txt"), "-o", out, "-H", `Origin: ${ORIGIN}`, ...extra, url]);
  return { headers: readFileSync(join(tmp, "hdr.txt"), "utf8"), body: readFileSync(out) };
}

// Sandboxes here reach the network through a proxy that node's fetch ignores,
// so fall back to curl, which is already configured for it. On a normal machine
// the first probe succeeds and native fetch is used throughout.
try {
  await fetch("https://archive.org/metadata/nonexistent-probe-item");
} catch {
  console.log("(native fetch can't reach the network — using curl)\n");
  globalThis.fetch = async (url) => {
    const { headers, body } = curl(String(url));
    const status = Number(headers.match(/HTTP\/[\d.]+ (\d{3})/g)?.pop()?.slice(-3) ?? 0);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(body.toString("utf8")),
      text: async () => body.toString("utf8"),
    };
  };
}

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const usable = (t) =>
  !!t && typeof t.id === "string" && !!t.title && !!t.artist && /^https:\/\//.test(t.url ?? "");

const QUERIES = { apple: "blinding lights", archive: "grateful dead", audius: "house" };
const only = process.argv[2];

for (const src of SOURCES) {
  if (only && src.id !== only) continue;
  console.log(`\n${src.label}`);
  let first = null;

  for (const [what, run] of [
    ["search", () => src.search(QUERIES[src.id] ?? "music")],
    ["browse", () => src.browse(src.genres[0])],
  ]) {
    let rows = [];
    let err = "";
    try { rows = await run(); } catch (e) { err = e.message; }
    check(`${what} returns rows`, rows.length > 0, err || `${rows.length} rows`);
    if (!rows.length) continue;
    const bad = rows.filter((t) => !usable(t));
    check(`${what} rows are complete`, bad.length === 0, bad.length ? `${bad.length} missing id/title/artist/url` : `e.g. ${rows[0].artist} — ${rows[0].title}`);
    // a duration of zero would show as "0:00" on the row and read as broken
    const timed = rows.filter((t) => t.duration > 0).length;
    check(`${what} rows carry a duration`, timed === rows.length, `${timed}/${rows.length}`);
    first ??= rows[0];
  }

  if (first) {
    const { headers } = curl(first.url, ["-r", "0-4095"]);
    check("audio is CORS-readable", /access-control-allow-origin:\s*(\*|https)/i.test(headers),
      headers.match(/access-control-allow-origin:.*/i)?.[0]?.trim() ?? "no header — unimportable");
    const type = headers.match(/content-type:\s*(\S+)/i)?.[1] ?? "";
    check("served as audio", /^audio\//i.test(type), type || "no content-type");
  }
}

console.log(failed ? `\n${failed} check(s) failed\n` : "\nall checks passed\n");
process.exit(failed ? 1 : 0);
