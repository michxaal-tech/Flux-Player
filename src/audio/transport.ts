import { engine } from "./engine";
import { ensurePeaks } from "./peaks";
import { blobStore, cacheUrl, dropUrl, getUrl } from "../store/blobStore";
import { getPlayingList, useStore } from "../store/useStore";
import type { Track } from "../types";
import { cleanName, isAudioFile, uid } from "../utils";
import { isYouTube, ytLoad, ytPause, ytPlay, ytSeek, ytStop } from "../youtube";

const S = () => useStore.getState();

export async function playAt(plId: string, i: number): Promise<void> {
  const s = S();
  const pl = s.playlists.find((p) => p.id === plId);
  const tr = pl?.tracks[i];
  if (!pl || !tr) return;
  // A YouTube track has no stored audio — it plays in YouTube's own iframe.
  // Branching here rather than in every caller keeps the one entry point.
  if (isYouTube(tr)) {
    engine.audio.pause();
    ytLoad(tr.sourceId!);
    ytPlay();
    useStore.setState({
      playPl: plId, current: i, playing: true,
      loopA: null, loopB: null, cues: [null, null, null, null],
      // the reactive features work from decoded samples, which a cross-origin
      // iframe does not expose; say so once rather than looking broken
      ytStatus: "Playing in YouTube's player — the visualizer won't react to it.",
    });
    S().updateTrack(tr.id, { plays: (tr.plays || 0) + 1, lastPlayedAt: Date.now() });
    useStore.setState((st) => ({ stats: { ...st.stats, plays: st.stats.plays + 1 } }));
    return;
  }
  ytStop();
  engine.ensure();
  const wantInst = s.instMode && tr.hasInst;
  const url = (wantInst ? await getUrl(`inst-${tr.fileId}`) : null) ?? (await getUrl(tr.fileId));
  if (!url) {
    console.warn(`Audio for "${tr.name}" is missing from storage.`);
    return;
  }
  const el = engine.audio;
  const doSwitch = () => {
    el.src = url;
    el.volume = S().volume;
    const useFx = tr.fxPin || null;
    if (useFx) useStore.setState({ fx: { ...useFx }, activePreset: "PINNED" });
    const fx = useFx || S().fx;
    el.playbackRate = fx.speed;
    engine.setPreservesPitch(!fx.vinyl);
    el.play().then(() => useStore.setState({ playing: true })).catch(() => {});
    useStore.setState({
      playPl: plId, current: i,
      loopA: null, loopB: null, cues: [null, null, null, null],
    });
    S().updateTrack(tr.id, { plays: (tr.plays || 0) + 1, lastPlayedAt: Date.now() });
    useStore.setState((st) => ({ stats: { ...st.stats, plays: st.stats.plays + 1 } }));
    ensurePeaks(tr);
    const n = engine.nodes;
    if (n && S().smooth) n.fader.gain.setTargetAtTime(1, n.ctx.currentTime, 0.12);
  };
  const n = engine.nodes;
  if (s.smooth && n && s.playing) {
    n.fader.gain.setTargetAtTime(0, n.ctx.currentTime, 0.08);
    setTimeout(doSwitch, 240);
  } else doSwitch();
}

export async function addFiles(fileList: FileList | File[]): Promise<void> {
  const all = Array.from(fileList);
  const audioFiles = all.filter(isAudioFile);
  const rejected = all.length - audioFiles.length;
  if (!audioFiles.length) {
    // never fail silently: a picker that appears to do nothing is worse than
    // an error, and on iOS this is the common outcome
    S().set({
      importMsg: all.length
        ? `⚠ ${all.length === 1 ? "That file isn't" : "Those files aren't"} a recognised audio format (${all.map((f) => f.name.split(".").pop()).join(", ")})`
        : "⚠ No file was selected",
    });
    setTimeout(() => S().set({ importMsg: "" }), 7000);
    return;
  }
  if (rejected) {
    S().set({ importMsg: `Added ${audioFiles.length}; skipped ${rejected} non-audio file${rejected > 1 ? "s" : ""}` });
    setTimeout(() => S().set({ importMsg: "" }), 6000);
  }
  const s = S();
  const targetId = (s.viewMode.type === "pl" ? s.viewMode.id : null) || s.playPl;
  const pairs = audioFiles.map((f) => ({ f, id: uid() }));
  const items: Track[] = pairs.map(({ f, id }) => {
    cacheUrl(id, f); // playable immediately, even before the writes below land
    return {
      id, fileId: id, name: cleanName(f.name),
      plays: 0, fav: false, tags: [], note: "", addedAt: Date.now(), lastPlayedAt: 0,
    };
  });
  const wasEmpty = S().current < 0;
  const before = S().playlists.find((p) => p.id === targetId)?.tracks.length ?? 0;
  S().addTracks(targetId, items);
  if (wasEmpty) setTimeout(() => playAt(targetId, before), 60);
  // persist to storage in the background — importing an album must not
  // freeze the UI while every file is written to IndexedDB
  void (async () => {
    for (const { f, id } of pairs) {
      await blobStore.put(id, f).catch((e) => console.warn("Failed to persist audio:", e));
    }
  })();
}

export function togglePlay(): void {
  const s = S();
  if (s.current < 0) {
    if (getPlayingList(s).tracks.length) playAt(s.playPl, 0);
    return;
  }
  const cur = getPlayingList(s).tracks[s.current];
  if (isYouTube(cur)) {
    if (s.playing) { ytPause(); useStore.setState({ playing: false }); }
    else { ytPlay(); useStore.setState({ playing: true }); }
    return;
  }
  engine.ensure();
  const el = engine.audio;
  if (el.paused) {
    el.play();
    useStore.setState({ playing: true });
  } else {
    el.pause();
    useStore.setState({ playing: false });
  }
}

export function nextTrack(auto = false): void {
  const s = S();
  const list = s.playlists.find((p) => p.id === s.playPl);
  if (!list || !list.tracks.length) return;
  if (auto && s.repeat === "one") {
    playAt(s.playPl, s.current);
    return;
  }
  let n: number;
  if (s.shuffle && list.tracks.length > 1) {
    do { n = Math.floor(Math.random() * list.tracks.length); } while (n === s.current);
  } else {
    n = s.current + 1;
    if (n >= list.tracks.length) {
      if (s.repeat === "off" && auto) {
        useStore.setState({ playing: false });
        return;
      }
      n = 0;
    }
  }
  playAt(s.playPl, n);
}

export function prevTrack(): void {
  const s = S();
  const list = s.playlists.find((p) => p.id === s.playPl);
  if (!list || !list.tracks.length) return;
  const cur = list.tracks[s.current];
  if (isYouTube(cur)) {
    if (s.progress * s.duration > 3) { ytSeek(0); return; }
  } else if (engine.audio.currentTime > 3) {
    engine.audio.currentTime = 0;
    return;
  }
  playAt(s.playPl, (s.current - 1 + list.tracks.length) % list.tracks.length);
}

export function seek(t: number): void {
  const s = S();
  if (isYouTube(getPlayingList(s).tracks[s.current])) {
    ytSeek(t);
    if (s.duration > 0) useStore.setState({ progress: t / s.duration });
    return;
  }
  engine.audio.currentTime = t;
  useStore.setState({ progress: t });
}

// ── DJ tools ────────────────────────────────────────────────────
export function tapCue(i: number): void {
  const s = S();
  const cue = s.cues[i];
  if (cue === null) s.setCue(i, s.progress);
  else seek(cue);
}

let stutterIv: ReturnType<typeof setInterval> | null = null;

export function stutterDown(ms: number): void {
  const el = engine.audio;
  if (el.paused) return;
  const pos = el.currentTime;
  stutterIv = setInterval(() => { el.currentTime = pos; }, ms);
}

export function stutterUp(): void {
  if (stutterIv) {
    clearInterval(stutterIv);
    stutterIv = null;
  }
}

export function brake(): void {
  const el = engine.audio;
  if (el.paused || engine.brakeActive) return;
  engine.brakeActive = true;
  engine.setPreservesPitch(false);
  const start = performance.now();
  const from = el.playbackRate;
  const anim = (now: number) => {
    const p = Math.min(1, (now - start) / 850);
    el.playbackRate = Math.max(0.07, from * (1 - p) * (1 - p));
    if (p < 1) requestAnimationFrame(anim);
    else {
      el.pause();
      useStore.setState({ playing: false });
      const fx = S().fx;
      el.playbackRate = fx.speed;
      engine.setPreservesPitch(!fx.vinyl);
      engine.brakeActive = false;
    }
  };
  requestAnimationFrame(anim);
}

export function launch(): void {
  const el = engine.audio;
  engine.ensure();
  engine.brakeActive = true;
  engine.setPreservesPitch(false);
  el.playbackRate = 0.07;
  el.play().then(() => useStore.setState({ playing: true })).catch(() => {});
  const start = performance.now();
  const anim = (now: number) => {
    const p = Math.min(1, (now - start) / 850);
    const fx = S().fx;
    el.playbackRate = Math.max(0.07, fx.speed * p * p);
    if (p < 1) requestAnimationFrame(anim);
    else {
      el.playbackRate = fx.speed;
      engine.setPreservesPitch(!fx.vinyl);
      engine.brakeActive = false;
    }
  };
  requestAnimationFrame(anim);
}

/** Toggle instrumental mode, hot-swapping the current track's source in place. */
export async function setInstMode(on: boolean): Promise<void> {
  useStore.setState({ instMode: on });
  const s = S();
  const tr = s.playlists.find((p) => p.id === s.playPl)?.tracks[s.current];
  if (!tr || !tr.hasInst) return;
  const url = await getUrl(on ? `inst-${tr.fileId}` : tr.fileId);
  if (!url) return;
  const el = engine.audio;
  if (!el.src) return;
  const pos = el.currentTime;
  const wasPlaying = !el.paused;
  el.src = url;
  el.currentTime = pos;
  const fx = S().fx;
  el.playbackRate = fx.speed;
  engine.setPreservesPitch(!fx.vinyl);
  if (wasPlaying) el.play().catch(() => {});
}

// ── library ops with blob cleanup ───────────────────────────────
function fileIdRefCount(fileId: string): number {
  return S().playlists.flatMap((p) => p.tracks).filter((t) => t.fileId === fileId).length;
}

export function removeTrack(trackId: string, plId: string): void {
  const tr = S().playlists.find((p) => p.id === plId)?.tracks.find((t) => t.id === trackId);
  S().removeTrack(trackId, plId);
  if (tr && fileIdRefCount(tr.fileId) === 0) {
    dropUrl(tr.fileId);
    blobStore.del(tr.fileId);
    dropUrl(`inst-${tr.fileId}`);
    blobStore.del(`inst-${tr.fileId}`);
  }
}

export function deletePlaylist(plId: string): void {
  const s = S();
  if (s.playlists.length <= 1) return;
  const doomed = s.playlists.find((p) => p.id === plId);
  if (!doomed) return;
  const next = s.playlists.filter((p) => p.id !== plId);
  const patch: Partial<ReturnType<typeof S>> = {
    playlists: next,
    viewMode: { type: "pl", id: next[0].id },
  };
  if (s.playPl === plId) {
    engine.audio.pause();
    Object.assign(patch, { playing: false, current: -1, playPl: next[0].id });
  }
  useStore.setState(patch);
  for (const tr of doomed.tracks) {
    if (fileIdRefCount(tr.fileId) === 0) {
      dropUrl(tr.fileId);
      blobStore.del(tr.fileId);
      dropUrl(`inst-${tr.fileId}`);
      blobStore.del(`inst-${tr.fileId}`);
    }
  }
}

/** Alias used by the YouTube player when a video ends. */
export function next(): void {
  nextTrack(true);
}
