import { useEffect, useRef, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../constants";
import { getCurrentTrack, useStore } from "../store/useStore";
import { chip, Module, NewTag, Slider } from "./ui";
import {
  loadMelody, PATCHES, playNotes, setRevoiceLevel, stopNotes, toMidiFile, transcribe,
  type Melody, type Patch,
} from "../audio/revoice";

/** Common scales, as pitch-class sets. Locking to one pulls the handful of
 * mis-tracked notes back in tune instead of leaving them sour. */
const SCALES: { name: string; pcs: number[] | null }[] = [
  { name: "OFF", pcs: null },
  { name: "MAJOR", pcs: [0, 2, 4, 5, 7, 9, 11] },
  { name: "MINOR", pcs: [0, 2, 3, 5, 7, 8, 10] },
  { name: "PENTA", pcs: [0, 3, 5, 7, 10] },
];
const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Take the melody off a track and play it back with a different sound — the
 * "flip" workflow. Transcription assumes one voice at a time, so the separated
 * vocal is the accurate source; the full mix is offered because it needs no
 * separation first, and the UI is explicit that it is rougher.
 */
export function Revoice() {
  const track = useStore(getCurrentTrack);
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const status = useStore((s) => s.melodyStatus);

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"vocals" | "full" | "instrumental">("vocals");
  const [patch, setPatch] = useState<Patch>("SUPERSAW");
  const [level, setLevel] = useState(0.8);
  const [snap, setSnap] = useState(true);
  const [scaleIdx, setScaleIdx] = useState(2);
  const [root, setRoot] = useState(0);
  const [melody, setMelody] = useState<Melody | null>(null);
  const [busy, setBusy] = useState(false);
  const [mute, setMute] = useState(false);
  const lastKey = useRef("");

  // pull a cached melody when the track or source changes
  useEffect(() => {
    if (!track) { setMelody(null); return; }
    let alive = true;
    loadMelody(track.fileId, source).then((m) => { if (alive) setMelody(m); });
    return () => { alive = false; };
  }, [track?.fileId, source]);

  useEffect(() => setRevoiceLevel(melody && !mute ? level : 0), [level, melody, mute]);
  useEffect(() => () => stopNotes(), []);

  // (Re)schedule whenever playback jumps, the patch changes, or a new melody
  // lands. Notes are scheduled in a rolling window rather than all at once, so
  // a long track does not create thousands of oscillators up front.
  useEffect(() => {
    if (!melody || !playing || mute) { stopNotes(); return; }
    const key = `${patch}-${Math.floor(progress / 20)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const ac = (window as unknown as { __fluxEngine?: { nodes?: { ctx?: AudioContext } } }).__fluxEngine?.nodes?.ctx;
    playNotes(melody.notes, patch, (ac?.currentTime ?? 0) + 0.08, progress);
  }, [melody, playing, patch, mute, Math.floor(progress / 20)]);

  if (!track) return null;

  const scale = SCALES[scaleIdx].pcs
    ? SCALES[scaleIdx].pcs!.map((p) => (p + root) % 12)
    : undefined;

  const run = async () => {
    setBusy(true);
    stopNotes();
    const m = await transcribe(track.fileId, source, { snap, scale });
    if (m) { setMelody(m); lastKey.current = ""; }
    setBusy(false);
  };

  const saveMidi = () => {
    if (!melody) return;
    const url = URL.createObjectURL(toMidiFile(melody.notes, melody.bpm));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.name.replace(/\.[^.]+$/, "")} melody.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <Module
      title="🎹 REVOICE"
      extra={
        <button onClick={() => setOpen((v) => !v)} style={{ ...chip(open, MAG), padding: "5px 10px", fontSize: 9.5 }}>
          {open ? "HIDE" : "OPEN"} <NewTag />
        </button>
      }
    >
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
        Reads the melody off this track and plays it back as a synth — the sung line becomes an
        EDM lead. Export it as <b>.mid</b> to drop into FL Studio with your own sounds.
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)", marginBottom: 5 }}>SOURCE</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
            {([["vocals", "VOCAL"], ["full", "FULL MIX"], ["instrumental", "INSTRUMENTAL"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSource(k)} style={{ ...chip(source === k), padding: "7px 11px", fontSize: 9.5 }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 10 }}>
            {source === "vocals"
              ? "Most accurate — the tracker follows one voice at a time, and an isolated vocal is exactly that. Needs MAKE INSTRUMENTAL to have been run once."
              : source === "full"
                ? "No separation needed, but it will follow whatever is loudest and a dense mix confuses it. Fine for a quick look."
                : "Follows the lead instrument. Works well on a piano or synth line, poorly on a full band."}
          </div>

          <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)", marginBottom: 5 }}>CLEAN-UP</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <button onClick={() => setSnap(!snap)} style={{ ...chip(snap), padding: "7px 11px", fontSize: 9.5 }}>
              {snap ? "✓" : "✕"} SNAP TO BEAT
            </button>
            {SCALES.map((sc, i) => (
              <button key={sc.name} onClick={() => setScaleIdx(i)} style={{ ...chip(scaleIdx === i, MAG), padding: "7px 10px", fontSize: 9.5 }}>{sc.name}</button>
            ))}
            {scaleIdx > 0 && (
              <select
                value={root}
                onChange={(e) => setRoot(+e.target.value)}
                style={{ background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 8, color: "#fff", padding: "6px 8px", fontSize: 11 }}
              >
                {ROOTS.map((r, i) => <option key={r} value={i}>{r}</option>)}
              </select>
            )}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 10 }}>
            Snapping lines the notes up with the beat grid the analyser already found. A scale
            lock pulls stray semitones into key — a couple of mis-tracked notes are what usually
            make a transcription sound wrong.
          </div>

          <button
            data-transcribe
            disabled={busy}
            onClick={run}
            style={{
              width: "100%", padding: "11px", borderRadius: 10, cursor: busy ? "default" : "pointer",
              border: `1px solid ${MAG}`, background: busy ? "rgba(255,255,255,0.06)" : `${MAG}22`,
              color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", opacity: busy ? 0.6 : 1,
            }}
          >{busy ? "WORKING…" : melody ? "↻ RE-READ MELODY" : "▶ READ THE MELODY"}</button>

          {!!status && <div style={{ fontSize: 11, color: CYAN, fontFamily: MONO, marginTop: 8 }}>{status}</div>}

          {melody && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)", marginBottom: 5 }}>
                SOUND — {melody.notes.length} notes @ {Math.round(melody.bpm)} BPM
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {PATCHES.map((p) => (
                  <button key={p} data-patch={p} onClick={() => setPatch(p)} style={{ ...chip(patch === p), padding: "7px 10px", fontSize: 9.5 }}>{p}</button>
                ))}
              </div>
              <Slider
                label="SYNTH LEVEL" value={level} min={0} max={1} step={0.02}
                format={(v) => `${Math.round(v * 100)}%`} onChange={setLevel} color={MAG}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => setMute(!mute)} style={{ ...chip(!mute), padding: "7px 11px", fontSize: 9.5 }}>
                  {mute ? "▶ UNMUTE SYNTH" : "◼ MUTE SYNTH"}
                </button>
                <button data-savemidi onClick={saveMidi} style={{ ...chip(false, CYAN), padding: "7px 11px", fontSize: 9.5 }}>⬇ EXPORT .MID</button>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginTop: 8 }}>
                To fully replace the original, pair this with the FX rack's VOCAL CUT or load the
                instrumental — the synth is mixed in alongside, not over the top.
              </div>
            </div>
          )}
        </div>
      )}
    </Module>
  );
}
