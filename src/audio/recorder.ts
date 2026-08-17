import { engine } from "./engine";
import { blobStore, cacheUrl } from "../store/blobStore";
import { getCurrentTrack, useStore } from "../store/useStore";
import { uid } from "../utils";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let tick: ReturnType<typeof setInterval> | null = null;

// What the user did during the take, for AI naming. Just a list of strings;
// recorded regardless of whether AI is connected (it costs nothing).
let actionLog: string[] = [];
let unwatch: (() => void) | null = null;

function watchActions(): void {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  const subs = [
    useStore.subscribe((s) => s.activePreset, (p) => { if (p) actionLog.push(`${at()}: preset ${p}`); }),
    useStore.subscribe((s) => s.fx.speed, (v) => actionLog.push(`${at()}: speed ${v.toFixed(2)}x`)),
    useStore.subscribe((s) => s.fx.pitch, (v) => actionLog.push(`${at()}: pitch ${v} st`)),
    useStore.subscribe((s) => s.fx.reverb, (v) => actionLog.push(`${at()}: reverb ${Math.round(v * 100)}%`)),
    useStore.subscribe((s) => s.fx.crush, (v) => actionLog.push(`${at()}: crush ${Math.round(v * 100)}%`)),
    useStore.subscribe((s) => s.fx.vocalCut, (v) => actionLog.push(`${at()}: vocal cut ${v ? "on" : "off"}`)),
    useStore.subscribe((s) => s.visTheme, (v) => actionLog.push(`${at()}: visual ${v}`)),
    useStore.subscribe((s) => s.current, () => {
      const tr = getCurrentTrack(useStore.getState());
      if (tr) actionLog.push(`${at()}: track "${tr.name}"`);
    }),
  ];
  unwatch = () => subs.forEach((u) => u());
}

export function startRec(): void {
  engine.ensure();
  const n = engine.nodes;
  if (!n) return;
  let mime = "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
  }
  try {
    const rec = new MediaRecorder(n.streamDest.stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      const s = useStore.getState();
      const id = uid();
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      const secs = s.recTime;
      const name = `flux-take-${s.takes.length + 1}.${ext}`;
      cacheUrl(`take-${id}`, blob);
      await blobStore.put(`take-${id}`, blob).catch(() => {});
      s.addTake({ id, name, secs });
      // AI take naming: rename in place once Claude answers, never blocking
      // the save and never failing the take if it errors
      const log = actionLog.slice(0, 40);
      actionLog = [];
      if (s.aiReady && navigator.onLine) {
        import("../ai/features")
          .then(({ nameTake }) => nameTake(log, secs))
          .then((aiName) => {
            if (!aiName) return;
            useStore.setState((st) => ({
              takes: st.takes.map((t) => (t.id === id ? { ...t, name: `${aiName}.${ext}` } : t)),
            }));
          })
          .catch(() => { /* keep the default name */ });
      }
    };
    rec.start(250);
    actionLog = [];
    watchActions();
    recorder = rec;
    useStore.setState({ recState: "rec", recTime: 0 });
    tick = setInterval(() => useStore.setState((st) => ({ recTime: st.recTime + 1 })), 1000);
  } catch {
    useStore.setState({ recState: "idle" });
  }
}

export function stopRec(): void {
  recorder?.stop();
  recorder = null;
  if (tick) { clearInterval(tick); tick = null; }
  if (unwatch) { unwatch(); unwatch = null; }
  useStore.setState({ recState: "idle" });
}

export function deleteTake(id: string): void {
  useStore.getState().removeTake(id);
  blobStore.del(`take-${id}`);
}
