// Audio → notes. Monophonic pitch tracking, off the main thread.
//
// The goal is the "flip" workflow: pull the melody off a track, then play it
// back with your own sound. That only needs a *lead line*, not a full score,
// which is what makes this tractable without shipping a neural model —
// polyphonic transcription of a whole mix is a genuinely hard problem, but the
// melody of an isolated vocal or lead is a solved one.
//
// So this expects a single-voice signal. Run it on a separated vocal stem for
// a sung melody; on a full mix it will track whatever is loudest and the result
// will be rough. The UI says as much.
//
// Method is YIN (de Cheveigné & Kawahara): the difference function, cumulative
// mean normalisation, an absolute threshold, then parabolic interpolation for
// sub-sample precision. It is chosen over raw autocorrelation because the
// cumulative-mean step is specifically what kills octave errors, and an octave
// error in a melody is the difference between usable and useless.

const WIN = 2048;          // ~46ms at 44.1k — long enough for low male vocal
const HOP = 256;           // ~5.8ms, fine enough to catch fast runs
const FMIN = 65;           // C2
const FMAX = 1200;         // ~D6
const THRESH = 0.14;       // YIN aperiodicity threshold; lower = stricter

export interface Note {
  /** MIDI note number */
  midi: number;
  /** seconds */
  start: number;
  end: number;
  /** 0..1, from the RMS of the note's span */
  vel: number;
}

export interface TranscribeResult {
  notes: Note[];
  /** per-frame pitch in MIDI (0 = unvoiced), for display */
  track: number[];
  fps: number;
}

/** YIN pitch for one window. Returns Hz, or 0 when the frame is unvoiced. */
function yin(buf: Float32Array, off: number, rate: number): number {
  const tauMin = Math.max(2, Math.floor(rate / FMAX));
  const tauMax = Math.min(WIN >> 1, Math.floor(rate / FMIN));
  const diff = new Float32Array(tauMax + 1);

  // difference function
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < WIN - tauMax; i++) {
      const d = buf[off + i] - buf[off + i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // cumulative mean normalised difference — this is the step that suppresses
  // the octave-below false match that plain autocorrelation falls for
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - tauMin + 1)) / running : 1;
  }

  // first minimum below the threshold, not the global minimum: taking the
  // global one re-introduces the octave error the step above just removed
  let tauBest = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < THRESH) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauBest = tau;
      break;
    }
  }
  if (tauBest < 0) return 0;

  // parabolic interpolation around the minimum for sub-sample precision
  const x0 = tauBest > tauMin ? tauBest - 1 : tauBest;
  const x2 = tauBest + 1 < tauMax ? tauBest + 1 : tauBest;
  let better = tauBest;
  if (x0 !== tauBest && x2 !== tauBest) {
    const s0 = cmnd[x0], s1 = cmnd[tauBest], s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) better = tauBest + (s2 - s0) / denom;
  }
  return rate / better;
}

const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

self.onmessage = (e: MessageEvent<{ mono: ArrayBuffer; rate: number; beats?: number[]; snap?: boolean; scale?: number[] }>) => {
  const mono = new Float32Array(e.data.mono);
  const rate = e.data.rate;
  const fps = rate / HOP;
  const frames = Math.max(0, Math.floor((mono.length - WIN) / HOP));

  const pitch = new Float32Array(frames);
  const rms = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const off = i * HOP;
    let e2 = 0;
    for (let k = 0; k < WIN; k++) e2 += mono[off + k] * mono[off + k];
    rms[i] = Math.sqrt(e2 / WIN);
    // skip near-silence outright: YIN on noise returns confident nonsense
    pitch[i] = rms[i] < 0.006 ? 0 : yin(mono, off, rate);
    if (i % 400 === 0) self.postMessage({ type: "progress", value: i / Math.max(1, frames) });
  }

  // ── frame pitches → note events ────────────────────────────────────────
  // Median-filtered so a single bad frame in the middle of a held note does not
  // split it in two, which is the most common way transcription output turns
  // into confetti.
  const med = new Float32Array(frames);
  const K = 5;
  const scratch: number[] = [];
  for (let i = 0; i < frames; i++) {
    scratch.length = 0;
    for (let k = -K; k <= K; k++) {
      const j = i + k;
      if (j >= 0 && j < frames && pitch[j] > 0) scratch.push(pitch[j]);
    }
    if (scratch.length < K) { med[i] = 0; continue; }
    scratch.sort((a, b) => a - b);
    med[i] = scratch[scratch.length >> 1];
  }

  const notes: Note[] = [];
  const track: number[] = new Array(frames).fill(0);
  let curMidi = -1, startF = 0, sumRms = 0, count = 0;

  const flush = (endF: number) => {
    if (curMidi < 0) return;
    const dur = (endF - startF) / fps;
    // notes shorter than a 32nd at 120bpm are almost always tracking artefacts
    if (dur >= 0.06) {
      notes.push({
        midi: curMidi,
        start: startF / fps,
        end: endF / fps,
        vel: Math.max(0.15, Math.min(1, (sumRms / Math.max(1, count)) * 7)),
      });
    }
    curMidi = -1;
  };

  for (let i = 0; i < frames; i++) {
    const hz = med[i];
    if (hz <= 0) { flush(i); continue; }
    const m = hzToMidi(hz);
    track[i] = m;
    const q = Math.round(m);
    if (q !== curMidi) {
      // a new note only when the pitch has genuinely moved a semitone away —
      // vibrato crossing a semitone boundary must not retrigger
      if (curMidi >= 0 && Math.abs(m - curMidi) < 0.62) continue;
      flush(i);
      curMidi = q;
      startF = i;
      sumRms = 0;
      count = 0;
    }
    sumRms += rms[i];
    count++;
  }
  flush(frames);

  // ── musical clean-up ───────────────────────────────────────────────────
  // Snapping to the analysed beat grid is what makes the result sit *with* the
  // track when it is re-voiced, rather than floating a few tens of ms off it.
  const beats = e.data.beats ?? [];
  if (e.data.snap && beats.length > 2) {
    // sixteenth-note grid derived from the real beat positions
    const grid: number[] = [];
    for (let i = 0; i + 1 < beats.length; i++) {
      const step = (beats[i + 1] - beats[i]) / 4;
      for (let k = 0; k < 4; k++) grid.push(beats[i] + step * k);
    }
    grid.push(beats[beats.length - 1]);
    const nearest = (t: number) => {
      let lo = 0, hi = grid.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (grid[mid] < t) lo = mid + 1; else hi = mid;
      }
      const a = grid[Math.max(0, lo - 1)], b = grid[lo];
      return Math.abs(a - t) < Math.abs(b - t) ? a : b;
    };
    for (const n of notes) {
      const s = nearest(n.start);
      const en = nearest(n.end);
      // never collapse a note to zero length by snapping both ends together
      n.start = s;
      n.end = en > s ? en : s + (grid[1] - grid[0] || 0.12);
    }
  }

  // Optional scale lock: pull stray semitones onto the track's own key. Without
  // it a couple of mis-tracked notes make an otherwise clean melody sound wrong.
  const scale = e.data.scale;
  if (scale && scale.length) {
    const set = new Set(scale.map((n) => ((n % 12) + 12) % 12));
    for (const n of notes) {
      const pc = ((n.midi % 12) + 12) % 12;
      if (set.has(pc)) continue;
      // move to whichever neighbouring scale degree is closer
      for (let d = 1; d <= 2; d++) {
        if (set.has((pc + d) % 12)) { n.midi += d; break; }
        if (set.has((pc - d + 12) % 12)) { n.midi -= d; break; }
      }
    }
  }

  // merge identical adjacent notes left by snapping or scale-locking
  const merged: Note[] = [];
  for (const n of notes) {
    const last = merged[merged.length - 1];
    if (last && last.midi === n.midi && n.start - last.end < 0.04) {
      last.end = Math.max(last.end, n.end);
      last.vel = Math.max(last.vel, n.vel);
    } else merged.push(n);
  }

  const result: TranscribeResult = { notes: merged, track, fps };
  self.postMessage({ type: "done", result });
};
