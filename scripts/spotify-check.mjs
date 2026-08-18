// Checks the Spotify link importer against the live service.
//
// Everything it depends on is outside this repo and can change without notice,
// so each leg is asserted separately and the failure says which one moved:
//
//   1. the embed page still carries a track list in the shape parseEmbed reads
//   2. the preview clips are still plain MP3 with CORS open
//   3. oEmbed — the one Spotify endpoint that reads cross-origin — still works
//
// Run: node scripts/spotify-check.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "spot-"));

// The parser is compiled straight out of src so this can never drift from what
// the app ships.
execFileSync("node_modules/.bin/esbuild", [
  "src/spotifyEmbed.ts", "--bundle", "--format=esm", `--outfile=${join(tmp, "embed.mjs")}`,
], { stdio: "inherit" });
const { parseEmbed } = await import(join(tmp, "embed.mjs"));

/** curl rather than fetch: this sandbox reaches the network through a proxy
 * curl is already configured for. */
function get(url, { head = false, headers = [] } = {}) {
  const out = join(tmp, "out.bin");
  const args = ["-sS", "-m", "45", "-D", join(tmp, "hdr.txt"), "-o", out];
  if (head) args.push("-r", "0-2047");
  for (const h of headers) args.push("-H", h);
  args.push("-H", "Origin: https://michxaal-tech.github.io", url);
  execFileSync("curl", args);
  return { headers: readFileSync(join(tmp, "hdr.txt"), "utf8"), body: readFileSync(out) };
}

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const LINKS = [
  ["playlist", "37i9dQZF1DXcBWIGoYBM5M"],
  ["album", "4yP0hdKOZPNshxUOjY0cZj"],
  ["track", "0VjIjW4GlUZAMYd2vXMi3b"],
];

console.log("\nembed pages");
let somePreview = "";
for (const [kind, id] of LINKS) {
  const url = `https://open.spotify.com/embed/${kind}/${id}`;
  let parsed = null;
  let err = "";
  try {
    parsed = parseEmbed(get(url, { headers: ["User-Agent: Mozilla/5.0"] }).body.toString("utf8"));
  } catch (e) {
    err = e.message;
  }
  check(`${kind} parses`, !!parsed, parsed ? `“${parsed.title}”, ${parsed.items.length} tracks` : err);
  if (!parsed) continue;
  const named = parsed.items.filter((i) => i.name && i.artists).length;
  check(`${kind} rows carry title + artist`, named === parsed.items.length, `${named}/${parsed.items.length}`);
  const withPrev = parsed.items.filter((i) => i.preview);
  check(`${kind} rows carry preview clips`, withPrev.length > 0, `${withPrev.length}/${parsed.items.length}`);
  if (withPrev[0]) somePreview ||= withPrev[0].preview;
}

console.log("\npreview audio");
if (!somePreview) {
  check("a preview url to test", false);
} else {
  const { headers, body } = get(somePreview, { head: true });
  check("CORS open", /access-control-allow-origin:\s*\*/i.test(headers), headers.match(/access-control-allow-origin:.*/i)?.[0] ?? "no header");
  check("served as mpeg", /content-type:\s*audio\/mpeg/i.test(headers), headers.match(/content-type:.*/i)?.[0] ?? "no header");
  // ID3 or a bare MPEG frame sync: enough to know it is not an error page
  const b = body.subarray(0, 4);
  check("looks like MP3", b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), `first bytes ${[...b].map((x) => x.toString(16)).join(" ")}`);
}

console.log("\noEmbed fallback");
{
  const link = "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b";
  const { headers, body } = get(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`);
  check("CORS open", /access-control-allow-origin:\s*\*/i.test(headers));
  let title = "";
  try { title = JSON.parse(body.toString("utf8")).title; } catch { /* reported below */ }
  check("returns a title", !!title, title);
}

console.log("\nreaders (the embed page itself sends no CORS header, so one of these must)");
{
  const direct = get("https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b", { head: true });
  check("embed page still refuses cross-origin reads", !/access-control-allow-origin/i.test(direct.headers),
    "if this ever fails the readers can be dropped");
  const r = get("https://r.jina.ai/https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b", {
    headers: ["x-respond-with: html"],
  });
  check("reader answers with CORS", /access-control-allow-origin:/i.test(r.headers), r.headers.match(/access-control-allow-origin:.*/i)?.[0] ?? "no header");
  check("reader returns the real page", r.body.toString("utf8").includes("__NEXT_DATA__"));
}

writeFileSync(join(tmp, "done"), "");
console.log(failed ? `\n${failed} check(s) failed\n` : "\nall checks passed\n");
process.exit(failed ? 1 : 0);
