// App-lifetime wiring that isn't any one component's job: the clock, the
// per-track analysis timeline, artwork loading, and the interface accent.
import { useStore, getCurrentTrack } from "../store/useStore";
import { clock } from "./clock";
import { setAnalysis } from "./signals";
import { artNow, dropAllArt, loadArt, onArt, hexToRgb } from "./art";

let wired = false;

export function wireRuntime(): void {
  if (wired) return;
  wired = true;
  clock.wire();

  // ── analysis timeline for the playing track ──
  const wantAnalysis = () => {
    const st = useStore.getState();
    const tr = getCurrentTrack(st);
    setAnalysis(null);
    if (!st.analyzedMode || !tr?.fileId) return;
    import("../audio/analysis").then(({ ensureAnalysis }) =>
      ensureAnalysis(tr.fileId, false, useStore.getState().deepAnalyze).then((a) => {
        const now = getCurrentTrack(useStore.getState());
        if (a && now?.fileId === tr.fileId && useStore.getState().analyzedMode) setAnalysis(a);
      }),
    ).catch(() => {});
  };
  useStore.subscribe((s) => s.analyzedMode, wantAnalysis);
  useStore.subscribe((s) => getCurrentTrack(s)?.fileId, wantAnalysis, { fireImmediately: true });

  // ── artwork for the playing track (and its neighbours, so skipping is instant) ──
  useStore.subscribe(
    (s) => getCurrentTrack(s)?.id,
    () => {
      const s = useStore.getState();
      const pl = s.playlists.find((p) => p.id === s.playPl);
      for (const d of [0, 1, -1]) {
        const tr = pl?.tracks[s.current + d];
        if (tr) void loadArt(tr);
      }
      applyAccent();
    },
    { fireImmediately: true },
  );
  onArt(applyAccent);
  // an AI cover was generated or removed: re-read artwork everywhere
  useStore.subscribe((s) => s.coverRev, () => {
    dropAllArt();
    const tr = getCurrentTrack(useStore.getState());
    if (tr) void loadArt(tr);
  });

  // ── interface theme + motion preference on the root element ──
  const applyUi = () => {
    const { ui } = useStore.getState();
    const root = document.documentElement;
    root.dataset.theme = ui.theme;
    const sysReduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    root.dataset.motion = sysReduce && ui.motion === "full" ? "calm" : ui.motion;
    applyAccent();
  };
  useStore.subscribe((s) => s.ui, applyUi, { fireImmediately: true });
}

// ── accent: tweened CSS variables ──────────────────────────────────────────
// The accent is the colour of the playing record. When the record changes the
// whole interface's accent glides to the new one over most of a second, in
// step with the artwork transition, instead of flipping on the first frame.
let cur: number[] | null = null;
let raf = 0;

function targetAccent(): [string, string] {
  const s = useStore.getState();
  if (s.ui.accent !== "artwork" && /^#[0-9a-f]{6}$/i.test(s.ui.accent)) return [s.ui.accent, s.ui.accent];
  const art = artNow(getCurrentTrack(s));
  if (s.ui.theme === "paper") {
    // on a light page the accent needs to be darker to keep its contrast
    return [art.palette[2], art.palette[1]];
  }
  return [art.accent, art.accent2];
}

export function applyAccent(): void {
  const [a1, a2] = targetAccent();
  const to = [...hexToRgb(a1), ...hexToRgb(a2)];
  const root = document.documentElement.style;
  const write = (v: number[]) => {
    root.setProperty("--accent", `rgb(${v[0] | 0} ${v[1] | 0} ${v[2] | 0})`);
    root.setProperty("--accent-2", `rgb(${v[3] | 0} ${v[4] | 0} ${v[5] | 0})`);
    root.setProperty("--accent-rgb", `${v[0] | 0} ${v[1] | 0} ${v[2] | 0}`);
    // ink on accent: dark unless the accent itself is dark
    const lum = (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255;
    root.setProperty("--on-accent", lum > 0.55 ? "#14110f" : "#fbf7f0");
  };
  if (!cur) { cur = to; write(cur); return; }
  cancelAnimationFrame(raf);
  const from = [...cur];
  const t0 = performance.now();
  const dur = document.documentElement.dataset.motion === "minimal" ? 1 : 900;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    cur = from.map((v, i) => v + (to[i] - v) * e);
    write(cur);
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
