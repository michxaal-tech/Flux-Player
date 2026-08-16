// One-time wiring between the zustand store and the audio engine / element.
import { engine } from "./engine";
import { nextTrack } from "./transport";
import { getCurrentTrack, useStore } from "../store/useStore";

let wired = false;

export function wireAudio(): void {
  if (wired) return;
  wired = true;

  const el = engine.audio;

  el.addEventListener("timeupdate", () => {
    const s = useStore.getState();
    if (s.loopA !== null && s.loopB !== null && el.currentTime >= s.loopB) {
      el.currentTime = s.loopA;
    }
    useStore.setState({ progress: el.currentTime, duration: el.duration || 0 });
  });
  el.addEventListener("ended", () => nextTrack(true));

  // fx → graph (impulse rebuild only when room size changes)
  useStore.subscribe((s) => s.fx, (fx, prev) => {
    engine.applyFx(fx);
    if (fx.size !== prev.size) engine.buildImpulse(fx.size);
  });
  useStore.subscribe((s) => s.amb, (amb) => engine.applyAmb(amb));
  useStore.subscribe((s) => s.volume, (v) => { el.volume = v; });

  // listening-time ticker (coarse 15s steps — each write re-persists state,
  // and persistence during playback is exactly what we're trying to avoid)
  let statTick: ReturnType<typeof setInterval> | null = null;
  useStore.subscribe(
    (s) => s.playing,
    (playing) => {
      if (statTick) { clearInterval(statTick); statTick = null; }
      if (playing) {
        statTick = setInterval(
          () => useStore.setState((st) => ({ stats: { ...st.stats, seconds: st.stats.seconds + 15 } })),
          15000
        );
      }
    },
    { fireImmediately: true }
  );

  // sleep timer
  setInterval(() => {
    const s = useStore.getState();
    if (s.sleepEnd && s.sleepEnd - Date.now() <= 0) {
      el.pause();
      useStore.setState({ playing: false, sleepEnd: null });
    }
  }, 1000);

  // auto lyric lookup: when enabled, search once per track as it starts
  // (delayed so duration metadata is loaded for match ranking)
  const lyricAttempted = new Set<string>();
  useStore.subscribe(
    (s) => getCurrentTrack(s)?.id,
    (id) => {
      if (!id) return;
      useStore.setState({ lyricAskArtist: false, lyricStatus: "" });
      setTimeout(async () => {
        const s = useStore.getState();
        const tr = getCurrentTrack(s);
        if (!s.lyricAuto || !tr || tr.id !== id || tr.lyrics || lyricAttempted.has(tr.id)) return;
        if (!navigator.onLine) return;
        lyricAttempted.add(tr.id);
        const { fetchLyrics } = await import("../lyrics");
        fetchLyrics(tr);
      }, 1600);
    }
  );

  // background-audio keepalive: iOS/Safari can suspend or "interrupt" the
  // AudioContext when the tab is backgrounded or the screen locks — resume
  // it whenever we should still be playing
  const keepAlive = () => {
    const s = useStore.getState();
    const n = engine.nodes;
    if (!s.playing || !n) return;
    if (n.ctx.state !== "running") n.ctx.resume().catch(() => {});
    if (el.paused && el.src) el.play().catch(() => {});
  };
  document.addEventListener("visibilitychange", keepAlive);
  window.addEventListener("focus", keepAlive);
  window.addEventListener("pageshow", keepAlive);
  // ctx statechange fires on iOS audio-session interruptions (calls, Siri)
  const watchCtx = setInterval(() => {
    const n = engine.nodes;
    if (n && !(n.ctx as any).__watched) {
      (n.ctx as any).__watched = true;
      n.ctx.addEventListener?.("statechange", keepAlive);
      clearInterval(watchCtx);
    }
  }, 1000);
}
