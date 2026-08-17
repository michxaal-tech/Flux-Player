// AI cover art: Claude returns SVG source, we sanitize it hard before it ever
// touches the DOM, then cache it in IndexedDB beside the audio blobs.
import { blobStore } from "../store/blobStore";
import { useStore } from "../store/useStore";

const key = (kind: "track" | "playlist", id: string) => `cover-${kind}-${id}`;

/**
 * Strips everything executable or remote from model-authored SVG: scripts,
 * event handlers, external references, foreignObject, and any non-SVG markup.
 * Returns null if the result isn't a usable SVG.
 */
export function sanitizeSvg(src: string): string | null {
  if (!src || src.length > 60000) return null;
  let s = src.trim();
  const fence = s.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  s = s.slice(start, end + 6);

  // remove dangerous elements wholesale
  s = s.replace(/<\s*(script|foreignObject|iframe|object|embed|link|style|animate[^\s>]*|set)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*(script|foreignObject|iframe|object|embed|link|use|image)\b[^>]*\/?>/gi, "");
  // inline event handlers and javascript: / data: / external urls
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, "none"); // only in-document refs
  s = s.replace(/javascript:/gi, "");

  if (!/^<svg[\s>]/i.test(s)) return null;
  // enforce a square viewBox so it lays out predictably in the UI
  if (!/viewBox\s*=/i.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 400 400"');
  s = s.replace(/<svg([^>]*)\swidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "<svg$1");
  s = s.replace(/<svg([^>]*)\sheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "<svg$1");
  return s;
}

export async function saveCover(kind: "track" | "playlist", id: string, rawSvg: string): Promise<boolean> {
  const clean = sanitizeSvg(rawSvg);
  if (!clean) return false;
  await blobStore.put(key(kind, id), new Blob([clean], { type: "image/svg+xml" }));
  memo.set(key(kind, id), clean);
  // nudge subscribers (cover components re-read on this counter)
  useStore.setState((s) => ({ coverRev: s.coverRev + 1 }));
  return true;
}

const memo = new Map<string, string | null>();

export async function loadCover(kind: "track" | "playlist", id: string): Promise<string | null> {
  const k = key(kind, id);
  if (memo.has(k)) return memo.get(k) ?? null;
  const blob = await blobStore.get(k);
  const svg = blob ? await blob.text() : null;
  memo.set(k, svg);
  return svg;
}

export async function deleteCover(kind: "track" | "playlist", id: string): Promise<void> {
  const k = key(kind, id);
  memo.delete(k);
  await blobStore.del(k);
  useStore.setState((s) => ({ coverRev: s.coverRev + 1 }));
}
