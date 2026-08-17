// Turns a transcribed melody into a whole arrangement.
//
// The melody alone is a lead line, not a track. But FLUX already knows a great
// deal about the song from the visualiser's analyser — the beat grid, the
// percussive hits, where the drops are, where sections change — and the melody
// itself implies a key and a chord under every bar. That is enough to build a
// drum pattern, a bassline and a chord part that are genuinely *this* song's,
// not a generic loop pasted underneath.
//
// Nothing here is claiming to arrange like a producer. It is claiming that the
// backing lands on the right beats, in the right key, and gets bigger at the
// drops — which is what makes a flip listenable.
import type { Note } from "./transcribeWorker";

export type Style = "EDM" | "HOUSE" | "TRAP" | "LOFI" | "DNB";

export interface DrumHit {
  kind: "kick" | "snare" | "hat" | "openhat" | "clap";
  t: number;
  vel: number;
}

export interface Arrangement {
  lead: Note[];
  bass: Note[];
  chords: Note[];
  drums: DrumHit[];
  /** detected tonic pitch-class and whether it read as minor */
  key: { root: number; minor: boolean };
}

/** Per-style voice choices and drum feel. */
export const STYLES: Record<Style, {
  lead: string; bass: string; chord: string;
  /** hat subdivisions per beat */
  hatDiv: number;
  /** kick on every beat (four-to-the-floor) vs on 1 and 3 */
  fourFloor: boolean;
  swing: number;
  chordHold: number;
}> = {
  EDM: { lead: "SUPERSAW", bass: "REESE", chord: "STAB", hatDiv: 2, fourFloor: true, swing: 0, chordHold: 0.9 },
  HOUSE: { lead: "PLUCK", bass: "SUB", chord: "STAB", hatDiv: 2, fourFloor: true, swing: 0.08, chordHold: 0.5 },
  TRAP: { lead: "BELL", bass: "SUB", chord: "PAD", hatDiv: 4, fourFloor: false, swing: 0, chordHold: 1.6 },
  LOFI: { lead: "KEYS", bass: "SUB", chord: "PAD", hatDiv: 2, fourFloor: false, swing: 0.14, chordHold: 1.8 },
  DNB: { lead: "SQUARE LEAD", bass: "REESE", chord: "STAB", hatDiv: 4, fourFloor: false, swing: 0, chordHold: 0.6 },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * Estimates the key by scoring every root/mode against how much of the melody's
 * weighted pitch-class content falls inside that scale. Weighting by duration
 * matters: a long held tonic says far more about the key than a passing
 * sixteenth, and counting notes equally gets the mode wrong constantly.
 */
function detectKey(notes: Note[]): { root: number; minor: boolean } {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) w[((n.midi % 12) + 12) % 12] += Math.max(0.05, n.end - n.start);
  let best = { root: 0, minor: true, score: -1 };
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const scale = minor ? MINOR : MAJOR;
      let score = 0;
      for (const deg of scale) score += w[(root + deg) % 12];
      // the tonic and fifth carry extra weight — they are what actually
      // distinguishes a key from its relative major/minor, which share a scale
      score += w[root] * 1.6 + w[(root + 7) % 12] * 0.7;
      score += minor ? w[(root + 3) % 12] * 0.9 : w[(root + 4) % 12] * 0.9;
      if (score > best.score) best = { root, minor, score };
    }
  }
  return { root: best.root, minor: best.minor };
}

/** The scale degree a pitch class sits on, or -1 if it is outside the key. */
function degreeOf(pc: number, key: { root: number; minor: boolean }): number {
  const scale = key.minor ? MINOR : MAJOR;
  const rel = ((pc - key.root) % 12 + 12) % 12;
  return scale.indexOf(rel);
}

/**
 * Builds bass, chords and drums around a melody.
 *
 * @param beats  beat times from the offline analyser; the whole arrangement is
 *               placed on these rather than on a fixed grid, so it stays locked
 *               to the actual recording even if the tempo drifts
 * @param drops  drop times, used to make the backing bigger where the song is
 */
export function arrange(
  melody: Note[],
  beats: number[],
  drops: number[],
  style: Style,
  opts: { drums: boolean; bass: boolean; chords: boolean },
): Arrangement {
  const S = STYLES[style];
  const key = detectKey(melody);
  const bass: Note[] = [];
  const chords: Note[] = [];
  const drums: DrumHit[] = [];

  if (beats.length < 4) return { lead: melody, bass, chords, drums, key };

  const beatDur = (beats[beats.length - 1] - beats[0]) / Math.max(1, beats.length - 1);
  const inDrop = (t: number) => drops.some((d) => t >= d - 0.2 && t < d + 8);

  // ── bars of four beats ─────────────────────────────────────────────────
  for (let b = 0; b + 4 < beats.length; b += 4) {
    const barStart = beats[b];
    const barEnd = beats[Math.min(beats.length - 1, b + 4)];

    // The chord under this bar comes from the melody actually sounding in it:
    // the most-present scale degree is treated as the root, which tracks the
    // song's own harmony far better than cycling a fixed progression.
    const inBar = melody.filter((n) => n.end > barStart && n.start < barEnd);
    if (inBar.length === 0) continue;
    const deg = new Array<number>(7).fill(0);
    for (const n of inBar) {
      const d = degreeOf(((n.midi % 12) + 12) % 12, key);
      if (d >= 0) deg[d] += Math.max(0.05, Math.min(n.end, barEnd) - Math.max(n.start, barStart));
    }
    let rootDeg = 0;
    for (let i = 1; i < 7; i++) if (deg[i] > deg[rootDeg]) rootDeg = i;
    // prefer the tonic when it is close, so bars do not wander chord to chord
    if (deg[0] > deg[rootDeg] * 0.72) rootDeg = 0;

    const scale = key.minor ? MINOR : MAJOR;
    const rootPc = (key.root + scale[rootDeg]) % 12;
    // triad built by stacking scale thirds — this is what keeps the chord
    // diatonic instead of always major
    const triad = [0, 2, 4].map((step) => {
      const d2 = (rootDeg + step) % 7;
      const oct = Math.floor((rootDeg + step) / 7);
      return key.root + scale[d2] + oct * 12;
    });

    if (opts.bass) {
      // one low root per bar, or two on a drop for movement
      const bassMidi = 24 + rootPc + (key.minor ? 12 : 12);
      if (inDrop(barStart)) {
        bass.push({ midi: bassMidi, start: barStart, end: barStart + beatDur * 2 - 0.02, vel: 0.9 });
        bass.push({ midi: bassMidi, start: barStart + beatDur * 2, end: barEnd - 0.02, vel: 0.8 });
      } else {
        bass.push({ midi: bassMidi, start: barStart, end: barEnd - 0.02, vel: 0.75 });
      }
    }

    if (opts.chords) {
      const hold = Math.min(barEnd - barStart, beatDur * S.chordHold);
      for (const m of triad) {
        // voiced under the melody so the lead stays on top and audible
        chords.push({ midi: 48 + m, start: barStart, end: barStart + hold, vel: inDrop(barStart) ? 0.85 : 0.6 });
      }
    }
  }

  // ── drums, placed on the real beats ────────────────────────────────────
  if (opts.drums) {
    for (let i = 0; i + 1 < beats.length; i++) {
      const t = beats[i];
      const next = beats[i + 1];
      const step = next - t;
      const bar = i % 4;
      const big = inDrop(t);

      if (S.fourFloor) drums.push({ kind: "kick", t, vel: big ? 1 : 0.85 });
      else if (bar === 0 || bar === 2) drums.push({ kind: "kick", t, vel: big ? 1 : 0.85 });

      // backbeat
      if (bar === 1 || bar === 3) drums.push({ kind: style === "LOFI" ? "clap" : "snare", t, vel: big ? 0.95 : 0.8 });

      // hats, with swing pushing the off-beats late
      for (let k = 0; k < S.hatDiv; k++) {
        const frac = k / S.hatDiv;
        const swung = frac + (k % 2 === 1 ? S.swing / S.hatDiv : 0);
        const open = S.hatDiv === 2 && k === 1 && bar === 3;
        drums.push({
          kind: open ? "openhat" : "hat",
          t: t + step * swung,
          vel: (k === 0 ? 0.8 : 0.5) * (big ? 1 : 0.85),
        });
      }

      // a fill on the bar before a drop, so the drop is arrived at
      if (bar === 3 && drops.some((d) => d > next && d < next + step * 1.2)) {
        for (let k = 1; k <= 4; k++) {
          drums.push({ kind: "snare", t: t + (step * k) / 5, vel: 0.4 + k * 0.14 });
        }
      }
    }
  }

  return { lead: melody, bass, chords, drums, key };
}

export const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
