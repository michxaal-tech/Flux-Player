// The command palette, the tap-to-sync lyric editor and the lyric share card.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { artistOf, getCurrentTrack, useStore, BUILTIN_PRESETS } from "../store/useStore";
import { nextTrack, playAt, prevTrack, seek, togglePlay } from "../audio/transport";
import { engine } from "../audio/engine";
import { PRESETS } from "../constants";
import { clock } from "../flux/clock";
import { artNow } from "../flux/art";
import { lineAt } from "../flux/lyricTime";
import type { LyricLineData, Track, ViewId } from "../types";
import { fmt } from "../utils";
import { I } from "./icons";
import { ease, spring } from "./motion";
import { pickFiles } from "./files";
import { titleCase } from "./Library";

// ── command palette ────────────────────────────────────────────────────────
// ⌘K / Ctrl+K: one field that reaches everything — any track, any playlist,
// every view, looks, sound presets and the common actions — without touching
// the mouse. Results re-rank as you type; ↑↓ to move, Enter to run.
interface Cmd { id: string; label: string; hint?: string; group: string; icon: ReactNode; run: () => void; words: string }

function useCommands(): Cmd[] {
  const playlists = useStore((s) => s.playlists);
  const userLooks = useStore((s) => s.lookPresets);
  const userFx = useStore((s) => s.userPresets);
  return useMemo(() => {
    const S = useStore.getState;
    const set = useStore.setState;
    const out: Cmd[] = [];
    const add = (group: string, label: string, icon: ReactNode, run: () => void, hint = "", extra = "") =>
      out.push({ id: `${group}:${label}:${out.length}`, label, hint, group, icon, run, words: `${label} ${hint} ${extra} ${group}`.toLowerCase() });
    add("Playback", "Play / pause", <I.listen size={18} />, togglePlay, "Space");
    add("Playback", "Next track", <I.next size={18} />, () => nextTrack(), "→");
    add("Playback", "Previous track", <I.prev size={18} />, prevTrack, "←");
    add("Playback", "Toggle shuffle", <I.shuffle size={18} />, () => set({ shuffle: !S().shuffle }), "S");
    add("Playback", "Like this track", <I.heart size={18} />, () => { const t = getCurrentTrack(S()); if (t) S().toggleFav(t.id); }, "F");
    add("Playback", "Enter the stage", <I.stage size={18} />, () => set({ stage: true }), "V", "visualizer fullscreen");
    add("Playback", "Sleep in 30 minutes", <I.clock size={18} />, () => set({ sleepEnd: Date.now() + 30 * 60000 }), "", "timer");
    const views: [ViewId, string, ReactNode][] = [["listen", "Listen", <I.listen size={18} />], ["library", "Library", <I.library size={18} />], ["search", "Search", <I.search size={18} />], ["sound", "Sound", <I.sound size={18} />], ["studio", "Studio", <I.studio size={18} />], ["settings", "Settings", <I.settings size={18} />]];
    for (const [id, label, icon] of views) add("Go to", label, icon, () => set({ view: id, stage: false }));
    add("Library", "Add music…", <I.upload size={18} />, () => pickFiles());
    add("Library", "New playlist", <I.plus size={18} />, () => { S().newPlaylist(); set({ view: "library" }); });
    add("Lyrics", "Show / hide lyrics", <I.lyrics size={18} />, () => S().setLyricPrefs({ show: !S().lyricPrefs.show }));
    add("Lyrics", "Sync lyrics by tapping", <I.lyrics size={18} />, () => set({ lyricSync: true, view: "listen" }), "", "time karaoke");
    add("Lyrics", "Share current line as an image", <I.sparkle size={18} />, () => void shareLyricCard());
    for (const p of playlists) {
      add("Playlists", titleCase(p.name), <I.playlist size={18} />, () => set({ view: "library", libOpen: p.id, stage: false }), `${p.tracks.length} tracks`);
      p.tracks.forEach((t, i) => add("Tracks", t.name, <I.note size={18} />, () => void playAt(p.id, i), artistOf(t) ?? "", t.tags.join(" ")));
    }
    for (const l of [...userLooks, ...BUILTIN_PRESETS]) add("Looks", l.name, <I.studio size={18} />, () => S().applyLookPreset(l), l.note ?? "");
    for (const f of [...userFx, ...PRESETS]) add("Sound presets", titleCase(f.name), <I.sound size={18} />, () => S().applyPreset(f));
    return out;
  }, [playlists, userLooks, userFx]);
}

function score(c: Cmd, q: string): number {
  if (!q) return c.group === "Tracks" ? 0 : 1;
  const l = c.label.toLowerCase();
  if (l.startsWith(q)) return 5;
  if (l.includes(q)) return 4;
  // every typed word appears somewhere
  return q.split(/\s+/).every((w) => c.words.includes(w)) ? 2 : 0;
}

export function CommandPalette() {
  const open = useStore((s) => s.palette);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const cmds = useCommands();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        useStore.setState({ palette: !useStore.getState().palette });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);

  const results = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return cmds.map((c) => ({ c, s: score(c, qq) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.c);
  }, [cmds, q]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>("[data-sel=true]")?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const close = () => useStore.setState({ palette: false });
  const run = (c: Cmd | undefined) => { if (!c) return; close(); c.run(); };
  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pal"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onClick={close}
          style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgb(var(--scrim) / 0.6)", display: "grid", justifyItems: "center", alignContent: "start", padding: "12vh 16px 0" }}
        >
          <motion.div
            role="dialog" aria-label="Command palette"
            initial={{ y: -18, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -10, scale: 0.98 }} transition={spring.snap}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(100%, 620px)", background: "var(--bg-raise)", border: "1px solid var(--line-2)", borderRadius: 22, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 18px", borderBottom: "1px solid var(--line)" }}>
              <I.search size={20} style={{ color: "var(--accent)" }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                  else if (e.key === "Enter") run(results[sel]);
                  else if (e.key === "Escape") close();
                }}
                placeholder="Play a track, jump anywhere, change the look…"
                aria-label="Command"
                style={{ flex: 1, height: 58, background: "transparent", border: 0, fontSize: 18, fontFamily: "var(--font-display)", fontWeight: 600 }}
              />
              <kbd className="mono faint" style={{ fontSize: 11 }}>esc</kbd>
            </div>
            <div ref={list} className="scroll" role="listbox" style={{ maxHeight: "50vh", padding: 8 }}>
              {results.length === 0 && <div className="faint" style={{ padding: 22, textAlign: "center" }}>Nothing matches “{q}”.</div>}
              {results.map((c, i) => {
                const head = c.group !== lastGroup;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {head && <div className="eyebrow" style={{ padding: "10px 12px 4px" }}>{c.group}</div>}
                    <button
                      role="option"
                      aria-selected={i === sel}
                      data-sel={i === sel}
                      onMouseMove={() => setSel(i)}
                      onClick={() => run(c)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%", height: 44, padding: "0 12px", border: 0, borderRadius: 12, textAlign: "left",
                        background: i === sel ? "rgb(var(--accent-rgb) / 0.16)" : "transparent", color: "var(--text)", fontSize: 14.5,
                      }}
                    >
                      <span style={{ color: i === sel ? "var(--accent)" : "var(--text-3)", display: "grid" }}>{c.icon}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                      {c.hint && <span className="faint" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{c.hint}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── tap-to-sync lyric editor ───────────────────────────────────────────────
// For lyrics that have no timing (or the wrong timing): the song plays, and
// you tap — Space, or the big button — as each line starts. Every tap stamps
// the highlighted line with the time you actually heard it (the audible
// clock, so output latency is already accounted for). Undo steps back a line
// and rewinds a few seconds so you can take it again.
export function LyricSync() {
  const open = useStore((s) => s.lyricSync);
  const track = useStore((s) => getCurrentTrack(s));
  if (!open || !track) return null;
  return <LyricSyncInner key={track.id} track={track} />;
}

function LyricSyncInner({ track }: { track: Track }) {
  const [text, setText] = useState(() => (track.lyrics ?? []).map((l) => l.text).join("\n"));
  const [phase, setPhase] = useState<"write" | "tap">(track.lyrics?.length ? "tap" : "write");
  const lines = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), [text]);
  const [times, setTimes] = useState<number[]>([]);
  const idx = times.length;
  const done = phase === "tap" && idx >= lines.length && lines.length > 0;
  const box = useRef<HTMLDivElement>(null);
  const close = () => useStore.setState({ lyricSync: false });

  const start = () => {
    setTimes([]);
    setPhase("tap");
    seek(0);
    if (engine.audio.paused) togglePlay();
  };
  useEffect(() => { if (phase === "tap" && track.lyrics?.length) { seek(0); if (engine.audio.paused) togglePlay(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => { if (phase === "tap" && idx < lines.length) setTimes((t) => [...t, Math.max(0, +clock.audible().toFixed(2))]); };
  const undo = () => {
    setTimes((t) => {
      const next = t.slice(0, -1);
      seek(Math.max(0, (next[next.length - 1] ?? 0) - 2));
      return next;
    });
  };
  const save = () => {
    const out: LyricLineData[] = lines.map((l, i) => ({ t: times[i], text: l })).filter((l) => l.t !== undefined).sort((a, b) => a.t - b.t);
    useStore.getState().updateTrack(track.id, { lyrics: out, lyricsTimed: true, lyricOffset: 0 });
    useStore.setState({ lyricStatus: `✓ ${out.length} lines timed by hand` });
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 3500);
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === "TEXTAREA";
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (typing) { e.stopPropagation(); return; }
      if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (done) save(); else tap(); }
      else if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); undo(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  useEffect(() => { box.current?.querySelector<HTMLElement>("[data-cur=true]")?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [idx]);

  return (
    <motion.div
      role="dialog" aria-label="Sync lyrics by tapping"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgb(var(--scrim) / 0.92)", display: "grid", gridTemplateRows: "auto 1fr auto", padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, maxWidth: 760, width: "100%", margin: "0 auto" }}>
        <div>
          <div className="eyebrow">Sync lyrics · {track.name}</div>
          <div className="display" style={{ fontSize: "clamp(28px, 5vw, 44px)", marginTop: 8 }}>{phase === "write" ? "Write or paste the words" : done ? "That's every line" : "Tap as each line starts"}</div>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={close}><I.close size={22} /></button>
      </div>

      <div ref={box} className="scroll" style={{ maxWidth: 760, width: "100%", margin: "18px auto", minHeight: 0 }}>
        {phase === "write" ? (
          <textarea
            autoFocus
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"One line per row.\nPaste the lyrics here, then tap them into time with the song."}
            style={{ width: "100%", height: "100%", minHeight: 260, padding: 18, resize: "none", fontSize: 18, lineHeight: 1.5, fontFamily: "var(--font-display)", fontWeight: 600 }}
          />
        ) : (
          lines.map((l, i) => (
            <motion.div
              key={i}
              data-cur={i === idx}
              animate={{ opacity: i === idx ? 1 : i < idx ? 0.5 : 0.28, scale: i === idx ? 1 : 0.96, x: i === idx ? 8 : 0 }}
              transition={spring.slide}
              style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "8px 0", transformOrigin: "left center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(20px, 3.4vw, 30px)", lineHeight: 1.15 }}
            >
              <span className="mono" style={{ fontSize: 12, width: 44, flexShrink: 0, color: i < idx ? "var(--accent)" : "var(--text-3)", fontWeight: 500 }}>{i < idx ? fmt(times[i]) : "·"}</span>
              <span>{l}</span>
            </motion.div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", flexWrap: "wrap", maxWidth: 760, width: "100%", margin: "0 auto" }}>
        {phase === "write" ? (
          <button className="btn" data-variant="accent" disabled={!lines.length} onClick={start} style={{ height: 52, padding: "0 28px", fontSize: 16 }}>Start tapping · {lines.length} lines</button>
        ) : (
          <>
            <button className="btn" data-variant="ghost" onClick={() => setPhase("write")}><I.edit size={16} /> Edit words</button>
            <button className="btn" disabled={!idx} onClick={undo} title="Backspace"><I.back size={16} /> Undo</button>
            {done ? (
              <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={spring.pop} className="btn" data-variant="accent" onClick={save} style={{ height: 60, padding: "0 36px", fontSize: 17 }}><I.check size={20} /> Save timing</motion.button>
            ) : (
              <motion.button
                key={idx}
                initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring.pop}
                whileTap={{ scale: 0.92 }}
                className="btn" data-variant="accent" onPointerDown={tap}
                style={{ height: 72, padding: "0 46px", fontSize: 19, fontWeight: 700, touchAction: "manipulation" }}
              >Tap <span className="mono" style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>space</span></motion.button>
            )}
            <button className="btn" data-variant="ghost" onClick={start}><I.reset size={16} /> Restart</button>
            <span className="mono faint" style={{ fontSize: 12, minWidth: 70, textAlign: "right" }}>{Math.min(idx, lines.length)} / {lines.length}</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── lyric share card ───────────────────────────────────────────────────────
/** Draw the line being sung as a 1080×1350 card in the record's colours and save it as a PNG. */
export async function shareLyricCard(): Promise<void> {
  const s = useStore.getState();
  const tr = getCurrentTrack(s);
  const say = (lyricStatus: string) => { useStore.setState({ lyricStatus }); setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000); };
  if (!tr?.lyrics?.length) { say("No lyrics on this track to share"); return; }
  const at = lineAt(tr.lyrics, clock.audible() - s.lyricPrefs.offsetMs / 1000 - (tr.lyricOffset ?? 0));
  const line = tr.lyrics[at.index >= 0 ? at.index : Math.max(0, at.last)];
  const art = artNow(tr);
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  const [g0, d, m, b, sp] = art.palette;
  c.fillStyle = g0; c.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, col: string, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, col + "00");
    c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
  };
  blob(180, 160, 900, m, 0.85); blob(1000, 420, 760, b, 0.5); blob(420, 1320, 900, d, 0.9); blob(980, 1240, 620, art.accent, 0.4);
  await document.fonts.ready;
  const display = '"Bricolage Grotesque Variable", sans-serif';
  // the line, as large as fits in six rows
  const words = line.text.split(/\s+/);
  let size = 132, rows: string[] = [];
  for (; size > 44; size -= 6) {
    c.font = `800 ${size}px ${display}`;
    rows = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (c.measureText(next).width > W - 180 && cur) { rows.push(cur); cur = w; } else cur = next;
    }
    rows.push(cur);
    if (rows.length <= 6 && rows.every((r) => c.measureText(r).width <= W - 180)) break;
  }
  c.fillStyle = sp; c.textBaseline = "alphabetic";
  const lead = size * 1.04, top = H * 0.46 - (rows.length * lead) / 2 + size * 0.8;
  rows.forEach((r, i) => c.fillText(r, 90, top + i * lead));
  // footer: title, artist, mark
  const artist = artistOf(tr) ?? "";
  const title = artist && tr.name.startsWith(artist) ? tr.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : tr.name;
  c.font = `700 44px ${display}`; c.fillStyle = sp; c.fillText(title, 90, H - 150, W - 320);
  c.font = `500 34px "Instrument Sans Variable", sans-serif`; c.globalAlpha = 0.75; c.fillText(artist, 90, H - 100, W - 320); c.globalAlpha = 1;
  c.strokeStyle = sp; c.lineWidth = 7; c.beginPath(); c.arc(W - 130, H - 130, 40, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = art.accent; c.lineWidth = 9; c.lineCap = "round"; c.beginPath();
  for (let x = -42; x <= 42; x += 2) { const y = Math.sin((x / 42) * Math.PI * 1.5 + 0.4) * 17; if (x === -42) c.moveTo(W - 130 + x, H - 130 - y); else c.lineTo(W - 130 + x, H - 130 - y); }
  c.stroke();
  cv.toBlob((png) => {
    if (!png) { say("Couldn't make the image"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = `${title} — lyric.png`.replace(/[\\/:*?"<>|]/g, "");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say("✓ Lyric card saved");
  }, "image/png");
}
