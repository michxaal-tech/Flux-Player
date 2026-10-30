import type { Frame, ModeDef } from "../types";

// WORDS — the lyrics as the picture.
//
// The active line is set as large as the screen allows, ragged-left, in heavy
// display type. With real word timing the sung word lights up and swells on
// the low end; words still to come wait in a muted tone and those already sung
// settle into a warm one. Without word timing the whole line is lit — nothing
// here pretends to know which word is being sung when the source didn't say.
// Line changes are choreographed: the old line lifts away, the new one rises in
// word by word. With no lyrics at all the title and artist take the stage.

interface Layout { key: string; size: number; words: { text: string; x: number; y: number; w: number }[]; lead: number }
interface St { cur?: Layout & { at: number; idx: number }; prev?: Layout & { at: number }; lastIdx: number; lastKey: string }

const FONT = '"Bricolage Grotesque Variable", "Instrument Sans Variable", sans-serif';

function layout(c: CanvasRenderingContext2D, text: string, w: number, h: number, maxLines: number, weight = 800): Layout {
  const words = text.split(/\s+/).filter(Boolean);
  const maxW = w * 0.84;
  for (let size = Math.round(h * 0.2); size > 14; size = Math.round(size * 0.92)) {
    c.font = `${weight} ${size}px ${FONT}`;
    const space = c.measureText(" ").width;
    const out: Layout["words"] = [];
    let x = 0, line = 0;
    let ok = true;
    for (const wd of words) {
      const ww = c.measureText(wd).width;
      if (ww > maxW) { ok = false; break; }
      if (x > 0 && x + ww > maxW) { x = 0; line++; }
      out.push({ text: wd, x, y: line, w: ww });
      x += ww + space;
    }
    const lead = size * 0.98;
    if (ok && line + 1 <= maxLines && (line + 1) * lead < h * 0.7) {
      const blockH = (line + 1) * lead;
      const ox = w * 0.08, oy = h * 0.5 - blockH / 2 + size * 0.78;
      for (const o of out) { o.x += ox; o.y = oy + o.y * lead; }
      return { key: text, size, words: out, lead };
    }
  }
  return { key: text, size: 14, words: [], lead: 14 };
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export const words: ModeDef = {
  id: "words",
  name: "Words",
  line: "The lyrics, set as the picture",
  reacts: "Sung words light up · bass stretches the active word · lines rise and lift away",
  dials: ["Scale", "Texture"],
  ownsLyrics: true,
  kind: "2d",
  draw: (c, f: Frame, raw) => {
    const st = raw as unknown as St;
    if (st.lastIdx === undefined) { st.lastIdx = -99; st.lastKey = ""; }
    const { w, h, css } = f;
    c.fillStyle = css[0];
    c.fillRect(0, 0, w, h);
    const L = f.lyric;
    const hasLine = L.index >= 0 && !!L.text;
    const text = hasLine ? L.text : f.title || "Flux";
    const key = `${hasLine ? L.index : "title"}|${text}|${w}x${h}|${f.a.toFixed(2)}`;
    const now = f.time;

    // background texture: the artist (or title) repeated in outline, drifting
    if (f.b > 0.05) {
      const tex = (f.artist || f.title || "flux").toUpperCase();
      const ts = h * 0.16;
      c.font = `800 ${ts}px ${FONT}`;
      c.strokeStyle = css[1];
      c.lineWidth = Math.max(1, f.px);
      c.globalAlpha = 0.35 * f.b;
      const tw = c.measureText(tex + "  ").width;
      for (let r = 0; r < 6; r++) {
        const off = ((now * 18 * (r % 2 ? 1 : -1)) % tw + tw) % tw;
        for (let x = -tw - off; x < w + tw; x += tw) c.strokeText(tex, x, ts * (r + 0.9));
      }
      c.globalAlpha = 1;
    }

    if (key !== st.lastKey) {
      const lines = Math.round(2 + f.a * 3);
      const lay = layout(c, text, w, h, lines);
      if (st.cur && st.cur.key !== lay.key) st.prev = { ...st.cur, at: now };
      st.cur = { ...lay, at: now, idx: hasLine ? L.index : -1 };
      st.lastKey = key;
    }
    const cur = st.cur!;
    // outgoing line lifts and fades
    if (st.prev) {
      const p = easeOut((now - st.prev.at) / 0.45);
      if (p >= 1) st.prev = undefined;
      else {
        c.font = `800 ${st.prev.size}px ${FONT}`;
        c.fillStyle = css[3];
        c.globalAlpha = (1 - p) * 0.8;
        for (const wd of st.prev.words) c.fillText(wd.text, wd.x, wd.y - p * st.prev.size * 0.6);
        c.globalAlpha = 1;
      }
    }
    c.font = `800 ${cur.size}px ${FONT}`;
    const timed = hasLine && L.timed && L.words && L.words.length === cur.words.length;
    cur.words.forEach((wd, i) => {
      const enter = easeOut((now - cur.at - i * 0.055) / 0.5);
      if (enter <= 0) return;
      let color = css[4], alpha = 1, sx = 1;
      if (timed) {
        const tw = L.words![i];
        if (L.t < tw.t) { color = css[2]; alpha = 0.55; }
        else if (L.t < tw.e) {
          color = css[4];
          sx = 1 + f.bass * 0.09 + f.accent * 0.03;
        } else { color = css[3]; alpha = 0.95; }
      } else if (!hasLine) {
        color = i === 0 ? css[4] : css[3];
      }
      c.save();
      const y = wd.y + (1 - enter) * cur.size * 0.5;
      c.translate(wd.x, y);
      c.scale(sx, 1);
      c.globalAlpha = alpha * enter;
      c.fillStyle = color;
      c.fillText(wd.text, 0, 0);
      c.restore();
    });
    // with no lyrics, the artist sits under the title; between lines, a
    // breathing marker shows the music continuing
    if (!hasLine) {
      c.globalAlpha = 0.7;
      c.fillStyle = css[3];
      const s2 = Math.max(16, cur.size * 0.22);
      c.font = `500 ${s2}px ${FONT}`;
      const last = cur.words[cur.words.length - 1];
      if (last && f.artist) c.fillText(f.artist, w * 0.08, last.y + cur.size * 0.7 + s2);
      c.globalAlpha = 1;
    }
  },
};
