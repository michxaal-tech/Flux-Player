// One-time wiring between the zustand store and the audio engine / element.
import { engine } from "./engine";
import { nextTrack } from "./transport";
import { useStore } from "../store/useStore";

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

  // listening-time ticker
  let statTick: ReturnType<typeof setInterval> | null = null;
  useStore.subscribe(
    (s) => s.playing,
    (playing) => {
      if (statTick) { clearInterval(statTick); statTick = null; }
      if (playing) {
        statTick = setInterval(
          () => useStore.setState((st) => ({ stats: { ...st.stats, seconds: st.stats.seconds + 1 } })),
          1000
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
