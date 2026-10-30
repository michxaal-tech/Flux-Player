// Which lyric line (and word) is active at a given audible time.
//
// Shared by the lyric view and the stage so the two can never disagree about
// where the singer is. Binary search, so seeking anywhere is O(log n) with no
// cursor to rewind.
import type { LyricLineData } from "../types";

export interface LineAt {
  /** active line index, -1 before the first line or during a long gap */
  index: number;
  /** index of the most recent line that has started (even inside a gap) */
  last: number;
  /** progress through the active line, 0..1 */
  progress: number;
  start: number;
  end: number;
  /** inside an instrumental gap: seconds until the next line starts */
  gapLeft: number;
  /** the gap's length, so the countdown can be drawn as a fraction */
  gapLen: number;
  /** from the last line's start to the next line's — what decides whether a
   * pause is long enough to count as an instrumental passage */
  span: number;
}

/** A line stays active this long at most when the next line is far away. */
export const MAX_DWELL = 7;
/** a gap at least this long is shown as an instrumental passage */
export const GAP_MIN = 9;

export function estimateEnd(lines: LyricLineData[], i: number): number {
  const l = lines[i];
  const next = lines[i + 1]?.t ?? l.t + MAX_DWELL;
  if (l.e && l.e > l.t) return Math.min(l.e + 0.4, next);
  const lastWord = l.words?.[l.words.length - 1];
  if (lastWord) return Math.min((lastWord.e ?? lastWord.t + 0.6) + 0.5, next);
  // a line's sung length scales with its length: ~0.32s per word plus a breath
  // A close next line simply takes over; a distant one means a gap follows,
  // so the line lets go after roughly the time it takes to sing.
  if (next - l.t <= MAX_DWELL) return next;
  const est = l.t + Math.max(3.5, l.text.split(/\s+/).length * 0.42 + 1.4);
  return Math.min(next, est);
}

export function lineAt(lines: LyricLineData[] | undefined | null, t: number): LineAt {
  const none: LineAt = { index: -1, last: -1, progress: 0, start: 0, end: 0, gapLeft: 0, gapLen: 0, span: 0 };
  if (!lines?.length) return none;
  let lo = 0, hi = lines.length - 1, i = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lines[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1;
  }
  if (i < 0) {
    const first = lines[0].t;
    return { ...none, gapLeft: first - t, gapLen: first, span: first };
  }
  const end = estimateEnd(lines, i);
  const next = lines[i + 1]?.t ?? Infinity;
  if (t >= end) {
    const len = next - end;
    return { ...none, last: i, gapLeft: Number.isFinite(next) ? next - t : 0, gapLen: Number.isFinite(len) ? len : 0, span: Number.isFinite(next) ? next - lines[i].t : 0 };
  }
  return { index: i, last: i, progress: (t - lines[i].t) / Math.max(0.1, end - lines[i].t), start: lines[i].t, end, gapLeft: 0, gapLen: 0, span: 0 };
}

/** Index of the word being sung, -1 before the first, words.length after the last. */
export function wordAt(line: LyricLineData, t: number): number {
  const ws = line.words;
  if (!ws?.length) return -1;
  let k = -1;
  for (let j = 0; j < ws.length; j++) if (ws[j].t <= t) k = j;
  if (k >= 0) {
    const e = ws[k].e ?? ws[k + 1]?.t ?? ws[k].t + 0.8;
    if (t >= e && k === ws.length - 1) return ws.length;
  }
  return k;
}
