// One-time wiring between the zustand store and the audio engine / element.
import { engine } from "./engine";
import { nextTrack } from "./transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { live } from "../visualizer/live";

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

  // ── AI runtime hooks (no-ops until a key is connected) ──
  // Remember the live BPM reading per track so AI features can reason about
  // tempo; sampled a few seconds in, once detection has locked.
  let bpmTimer: ReturnType<typeof setTimeout> | null = null;
  // Spoken transitions (radio host / hype man) as each track starts.
  let lastTrackName = "";
  useStore.subscribe(
    (s) => getCurrentTrack(s)?.id,
    (id) => {
      if (bpmTimer) { clearTimeout(bpmTimer); bpmTimer = null; }
      if (!id) return;
      bpmTimer = setTimeout(() => {
        const s = useStore.getState();
        const tr = getCurrentTrack(s);
        const bpm = live.bpm;
        if (tr && tr.id === id && bpm >= 50 && bpm <= 220) {
          useStore.setState({ trackBpm: { ...s.trackBpm, [tr.id]: bpm } });
        }
      }, 12000);

      const s0 = useStore.getState();
      const tr = getCurrentTrack(s0);
      const mode = s0.radioMode;
      const prevName = lastTrackName;
      lastTrackName = tr?.name ?? "";
      if (mode === "off" || !s0.aiReady || !tr || !navigator.onLine) return;
      // let the intro start before talking over it
      setTimeout(async () => {
        const s = useStore.getState();
        if (!s.playing || getCurrentTrack(s)?.id !== id || s.radioMode === "off") return;
        try {
          const { radioLine } = await import("../ai/features");
          await radioLine(s.radioMode === "hype" ? "hype" : "host", prevName, tr.name);
        } catch { /* a failed line must never interrupt playback */ }
      }, 1200);
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
