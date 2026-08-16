import { engine } from "./engine";
import { blobStore, cacheUrl } from "../store/blobStore";
import { useStore } from "../store/useStore";
import { uid } from "../utils";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let tick: ReturnType<typeof setInterval> | null = null;

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
      const name = `flux-take-${s.takes.length + 1}.${mime.includes("mp4") ? "m4a" : "webm"}`;
      cacheUrl(`take-${id}`, blob);
      await blobStore.put(`take-${id}`, blob).catch(() => {});
      s.addTake({ id, name, secs: useStore.getState().recTime });
    };
    rec.start(250);
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
  useStore.setState({ recState: "idle" });
}

export function deleteTake(id: string): void {
  useStore.getState().removeTake(id);
  blobStore.del(`take-${id}`);
}
