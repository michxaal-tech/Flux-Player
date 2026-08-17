// Visualizer video export: composites the visualizer's canvas layers into one
// capture surface, pairs it with the live master audio, and records both to a
// single video file.
//
// This is necessarily a real-time capture — the visualizer is driven by a live
// AnalyserNode reading the playing audio, so there is no way to render it
// faster than the song plays. A 3 minute track takes 3 minutes to export.
import { engine } from "./engine";
import { blobStore, cacheUrl } from "../store/blobStore";
import { getCurrentTrack, useStore } from "../store/useStore";
import { canvasRefs } from "../visualizer/live";
import { uid } from "../utils";
import { seek } from "./transport";

let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];
let raf = 0;
let tick: ReturnType<typeof setInterval> | null = null;
let cleanup: (() => void)[] = [];

/** Long edge of the exported video, so a high-DPR tablet doesn't produce a
 * needlessly enormous file (and drop frames trying to encode it). */
const MAX_EDGE = 1280;

const MIMES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

function pickMime(): string {
  for (const m of MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* older engines throw instead of returning false */ }
  }
  return "";
}

export function videoExportSupported(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  const probe = document.createElement("canvas") as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  return typeof probe.captureStream === "function" && !!pickMime();
}

function fail(msg: string): void {
  useStore.setState({ vidState: "idle", vidMsg: msg });
  setTimeout(() => useStore.setState({ vidMsg: "" }), 6000);
}

/**
 * Starts capturing the visualizer. `fromStart` restarts the track so the
 * export covers the whole song, which is what "download this song with the
 * visualizer" almost always means.
 */
export async function startVideoExport(fromStart = true): Promise<void> {
  if (rec) return;
  if (!videoExportSupported()) {
    fail("This browser can't record video — try Safari 15.4+ or Chrome");
    return;
  }
  engine.ensure();
  const n = engine.nodes;
  const vis = canvasRefs.vis;
  if (!n || !vis) {
    fail("Open the visualizer first");
    return;
  }
  const track = getCurrentTrack(useStore.getState());
  if (!track) {
    fail("Load a track first");
    return;
  }

  // ── capture surface: the visualizer is drawn across three stacked canvases
  // (ambient background, the theme itself, the lyric overlay), so they have to
  // be flattened into one before they can be encoded ──
  const rect = vis.getBoundingClientRect();
  const aspect = rect.height > 0 ? rect.width / rect.height : 16 / 9;
  let cw = MAX_EDGE, ch = Math.round(MAX_EDGE / aspect);
  if (ch > MAX_EDGE) { ch = MAX_EDGE; cw = Math.round(MAX_EDGE * aspect); }
  // even dimensions keep every encoder happy
  cw -= cw % 2; ch -= ch % 2;

  const cap = document.createElement("canvas");
  cap.width = cw;
  cap.height = ch;
  const cx = cap.getContext("2d", { alpha: false });
  if (!cx) { fail("Couldn't create the capture canvas"); return; }

  const composite = () => {
    cx.fillStyle = "#05060A"; // matches the visualizer's own backdrop
    cx.fillRect(0, 0, cw, ch);
    for (const layer of [canvasRefs.bg, canvasRefs.vis, canvasRefs.lyr]) {
      if (layer && layer.width > 0 && layer.height > 0) {
        try { cx.drawImage(layer, 0, 0, cw, ch); } catch { /* mid-resize */ }
      }
    }
    raf = requestAnimationFrame(composite);
  };

  let stream: MediaStream;
  try {
    const vStream = (cap as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    stream = new MediaStream([...vStream.getVideoTracks(), ...n.streamDest.stream.getAudioTracks()]);
  } catch {
    fail("Couldn't capture the canvas on this browser");
    return;
  }

  const mime = pickMime();
  try {
    rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 192_000,
    });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      fail("This browser refused to start a video recording");
      return;
    }
  }

  chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    cancelAnimationFrame(raf);
    const ext = (rec?.mimeType || mime).includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: rec?.mimeType || mime || "video/webm" });
    chunks = [];
    rec = null;
    const s = useStore.getState();
    const secs = s.vidTime;
    useStore.setState({ vidState: "idle", vidTime: 0 });
    if (blob.size < 1000) { fail("Recording produced no data"); return; }

    const id = uid();
    const base = `${track.name.replace(/\.[^.]+$/, "")} · ${s.visTheme}`.slice(0, 60);
    const name = `${base}.${ext}`;
    const url = cacheUrl(`take-${id}`, blob);
    await blobStore.put(`take-${id}`, blob).catch(() => {});
    s.addTake({ id, name, secs, kind: "video" });

    // offer it straight away; it also stays in ME → takes either way
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      useStore.setState({ vidMsg: `✓ Saved “${name}” — also in ME → takes` });
    } catch {
      useStore.setState({ vidMsg: `✓ Saved to ME → takes: ${name}` });
    }
    setTimeout(() => useStore.setState({ vidMsg: "" }), 7000);
  };

  // auto-stop at the end of the track so a full-song export just finishes
  const onEnded = () => stopVideoExport();
  engine.audio.addEventListener("ended", onEnded);
  cleanup.push(() => engine.audio.removeEventListener("ended", onEnded));

  if (fromStart) {
    seek(0);
    if (engine.audio.paused) {
      try { await engine.audio.play(); } catch { /* autoplay policy */ }
      useStore.setState({ playing: true });
    }
  }

  composite();
  rec.start(1000);
  useStore.setState({ vidState: "rec", vidTime: 0, vidMsg: "" });
  tick = setInterval(() => useStore.setState((st) => ({ vidTime: st.vidTime + 1 })), 1000);
}

export function stopVideoExport(): void {
  if (tick) { clearInterval(tick); tick = null; }
  cleanup.forEach((f) => f());
  cleanup = [];
  if (rec && rec.state !== "inactive") {
    useStore.setState({ vidMsg: "Finishing the file…" });
    rec.stop(); // onstop finalizes, saves and downloads
  } else {
    cancelAnimationFrame(raf);
    useStore.setState({ vidState: "idle", vidTime: 0 });
  }
}
