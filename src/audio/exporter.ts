// High-level export flow: track blob → offline FX render → WAV/MP3 → saved take.
import { blobStore, cacheUrl } from "../store/blobStore";
import { useStore } from "../store/useStore";
import type { Track } from "../types";
import { uid } from "../utils";
import { encodeMp3, encodeWav } from "./encoders";
import { renderWithFx } from "./exportRender";

export async function exportTrack(tr: Track, format: "wav" | "mp3"): Promise<void> {
  const s = useStore.getState();
  if (s.exporting) return;
  const fx = tr.fxPin ?? s.fx;
  const label = tr.fxPin ? "pinned FX" : "current FX";
  useStore.setState({ exporting: `Rendering "${tr.name}" (${label})…` });
  try {
    const blob = await blobStore.get(tr.fileId);
    if (!blob) throw new Error("audio missing from storage");
    const rendered = await renderWithFx(blob, fx);
    useStore.setState({ exporting: format === "mp3" ? "Encoding MP3… 0%" : "Encoding WAV…" });
    const out =
      format === "wav"
        ? encodeWav(rendered)
        : await encodeMp3(rendered, (p) =>
            useStore.setState({ exporting: `Encoding MP3… ${Math.round(p * 100)}%` })
          );
    const id = uid();
    const name = `${tr.name.replace(/[^\w\- ]+/g, "").trim() || "flux-export"} [FLUX].${format}`;
    cacheUrl(`take-${id}`, out);
    await blobStore.put(`take-${id}`, out).catch(() => {});
    useStore.getState().addTake({ id, name, secs: Math.round(rendered.duration) });
    useStore.setState({ exporting: "" });
  } catch (e) {
    console.error("Export failed:", e);
    useStore.setState({ exporting: "" });
    alert(`Export failed: ${e instanceof Error ? e.message : e}`);
  }
}
