// Floating mini player for when FLUX isn't the window you're looking at.
//
// The web gives two very different mechanisms and neither covers everything:
//
//  • Document Picture-in-Picture (Chrome/Edge desktop) opens a real always-on-
//    top window we can fill with our own DOM — artwork, title, transport. This
//    is the good one.
//  • Video Picture-in-Picture (Safari, iOS/iPadOS) only floats a <video>, so we
//    pipe a small canvas into one and paint the mini player ourselves.
//
// Both require a user gesture to open. Browsers deliberately refuse to let a
// page pop a floating window while it is being backgrounded, so "open it when
// I leave" is attempted and quietly skipped when the browser says no — on iOS
// the lock screen / Control Center controls fill that gap instead.
import { nextTrack, prevTrack, togglePlay } from "./audio/transport";
import { getCurrentTrack, useStore } from "./store/useStore";
import { fmt } from "./utils";

type DocPiPWindow = Window & { document: Document };
interface DocPiP {
  requestWindow(opts: { width: number; height: number }): Promise<DocPiPWindow>;
  window: DocPiPWindow | null;
}
const docPiP = (): DocPiP | null =>
  (window as unknown as { documentPictureInPicture?: DocPiP }).documentPictureInPicture ?? null;

export function miniPlayerSupported(): boolean {
  return !!docPiP() || (typeof document !== "undefined" && !!document.pictureInPictureEnabled);
}

let unsub: (() => void) | null = null;
let pipWin: DocPiPWindow | null = null;
let vid: HTMLVideoElement | null = null;
let vidCanvas: HTMLCanvasElement | null = null;
let vidTimer: number | null = null;

export function miniPlayerOpen(): boolean {
  return !!pipWin || !!(document.pictureInPictureElement);
}

// ── Document PiP: our own DOM in a floating window ──────────────────────
async function openDocumentPiP(): Promise<boolean> {
  const api = docPiP();
  if (!api) return false;
  let w: DocPiPWindow;
  try {
    w = await api.requestWindow({ width: 320, height: 132 });
  } catch {
    return false; // no user activation, or the user declined
  }
  pipWin = w;
  const d = w.document;
  d.body.style.cssText =
    "margin:0;font-family:'Space Grotesk',system-ui,sans-serif;background:#08090D;color:#fff;overflow:hidden;user-select:none";

  const wrap = d.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;height:100vh;padding:12px 14px;box-sizing:border-box;gap:8px";
  const title = d.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const sub = d.createElement("div");
  sub.style.cssText = "font-size:10px;letter-spacing:.16em;opacity:.5";
  const bar = d.createElement("div");
  bar.style.cssText = "height:4px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden";
  const fill = d.createElement("div");
  fill.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg,#4de2f7,#f45ff0)";
  bar.appendChild(fill);

  const row = d.createElement("div");
  row.style.cssText = "display:flex;align-items:center;justify-content:center;gap:14px;margin-top:auto";
  const mk = (label: string, fn: () => void, big = false) => {
    const b = d.createElement("button");
    b.textContent = label;
    b.style.cssText = `border:none;cursor:pointer;border-radius:999px;color:#08090D;font-size:${big ? 16 : 13}px;
      width:${big ? 40 : 32}px;height:${big ? 40 : 32}px;background:${big ? "linear-gradient(120deg,#4de2f7,#f45ff0)" : "rgba(255,255,255,.14)"};
      ${big ? "" : "color:#fff;"}`;
    b.onclick = fn;
    return b;
  };
  const playBtn = mk("⏸", () => togglePlay(), true);
  row.append(mk("⏮", () => prevTrack()), playBtn, mk("⏭", () => nextTrack()));
  wrap.append(title, sub, bar, row);
  d.body.appendChild(wrap);

  const render = () => {
    const s = useStore.getState();
    const tr = getCurrentTrack(s);
    title.textContent = tr ? tr.name : "Nothing playing";
    sub.textContent = tr ? `${fmt(s.progress)} / ${fmt(s.duration)}` : "FLUX";
    fill.style.width = `${s.duration ? Math.min(100, (s.progress / s.duration) * 100) : 0}%`;
    playBtn.textContent = s.playing ? "⏸" : "▶";
  };
  render();
  unsub = useStore.subscribe(render);
  w.addEventListener("pagehide", closeMiniPlayer);
  return true;
}

// ── Video PiP: paint the mini player into a canvas and float that ───────
async function openVideoPiP(): Promise<boolean> {
  if (!document.pictureInPictureEnabled) return false;
  const cv = vidCanvas ?? document.createElement("canvas");
  vidCanvas = cv;
  cv.width = 640;
  cv.height = 360;
  const c = cv.getContext("2d")!;

  const paint = () => {
    const s = useStore.getState();
    const tr = getCurrentTrack(s);
    c.fillStyle = "#08090D";
    c.fillRect(0, 0, cv.width, cv.height);
    const g = c.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, "rgba(77,226,247,0.16)");
    g.addColorStop(1, "rgba(244,95,240,0.16)");
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#fff";
    c.font = "700 34px 'Space Grotesk', sans-serif";
    c.textAlign = "center";
    const name = tr ? tr.name : "Nothing playing";
    c.fillText(name.length > 26 ? `${name.slice(0, 25)}…` : name, cv.width / 2, cv.height / 2 - 6);
    c.font = "500 20px 'JetBrains Mono', monospace";
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillText(`${fmt(s.progress)} / ${fmt(s.duration)}`, cv.width / 2, cv.height / 2 + 34);
    const bw = cv.width * 0.62, bx = (cv.width - bw) / 2, by = cv.height / 2 + 62;
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.fillRect(bx, by, bw, 6);
    const gg = c.createLinearGradient(bx, 0, bx + bw, 0);
    gg.addColorStop(0, "#4de2f7");
    gg.addColorStop(1, "#f45ff0");
    c.fillStyle = gg;
    c.fillRect(bx, by, bw * (s.duration ? Math.min(1, s.progress / s.duration) : 0), 6);
  };
  paint();

  const v = vid ?? document.createElement("video");
  vid = v;
  v.muted = true;              // the real audio keeps coming from the engine
  v.playsInline = true;
  v.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px";
  if (!v.isConnected) document.body.appendChild(v);
  if (!v.srcObject) v.srcObject = cv.captureStream(2);
  try {
    await v.play();
    await v.requestPictureInPicture();
  } catch {
    return false;
  }
  vidTimer = window.setInterval(paint, 500);
  v.addEventListener("leavepictureinpicture", closeMiniPlayer, { once: true });
  // the system PiP controls drive the real transport
  navigator.mediaSession?.setActionHandler?.("play", () => togglePlay());
  navigator.mediaSession?.setActionHandler?.("pause", () => togglePlay());
  return true;
}

/** Opens the best mini player this browser supports. Needs a user gesture. */
export async function openMiniPlayer(): Promise<boolean> {
  if (miniPlayerOpen()) return true;
  if (await openDocumentPiP()) return true;
  return openVideoPiP();
}

export function closeMiniPlayer(): void {
  unsub?.();
  unsub = null;
  if (vidTimer) { clearInterval(vidTimer); vidTimer = null; }
  try { pipWin?.close(); } catch { /* already gone */ }
  pipWin = null;
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  if (vid) { vid.pause(); vid.remove(); vid = null; }
}

let wired = false;
/** Try to raise the mini player as the app is backgrounded. */
export function wireMiniPlayer(): void {
  if (wired) return;
  wired = true;
  document.addEventListener("visibilitychange", () => {
    const s = useStore.getState();
    if (document.visibilityState !== "hidden") return;
    if (!s.miniPlayer || !s.playing || miniPlayerOpen()) return;
    // Best effort: most browsers refuse to open a floating window without a
    // fresh user gesture, and that refusal is by design. The lock-screen
    // controls from the Media Session API cover the same need where it fails.
    openMiniPlayer().catch(() => {});
  });
}
