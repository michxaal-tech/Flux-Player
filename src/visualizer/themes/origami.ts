import type { ThemeDraw } from "../themeTypes";

interface Form {
  x: number; y: number;
  vx: number; vy: number;
  /** half-size in px */ sz: number;
  rot: number; vr: number;
  /** 0 = flat sheet, 1 = fully folded solid */ fold: number;
  /** fold direction, flipped by beats */ dir: number;
  /** fold rate */ fv: number;
  /** 4..MAXS creases */ sides: number;
  /** phase for asymmetric creasing */ ph: number;
  /** fade-in/out alpha */ a: number;
  /** is this slot part of the current population? */ on: number;
}

const MAXF = 60;    // hard cap on paper forms — never scales with canvas size
const MAXS = 8;     // max creases per form
const TONES = 4;    // facet shading tiers → 4 batched fills for everything

// Folding paper. Flat polygons crease along their spokes and pull themselves
// into three-dimensional forms — cranes, stars, boxes suggested rather than
// stated — then unfold and refold again. In a quiet passage three or four big
// sheets fold at a meditative crawl, barely turning. As the music drives, the
// air fills with dozens of small forms snapping open and shut and tumbling
// past each other, every beat reversing the fold mid-motion.
export const ORIGAMI: ThemeDraw = ({
  c, w, h, R, beat, beatE, energy, cfg, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.origami ??= {
    forms: [] as Form[],
    // preallocated geometry scratch — no allocation happens inside the frame
    vx: new Float32Array(MAXF * (MAXS + 1)),
    vy: new Float32Array(MAXF * (MAXS + 1)),
    tone: new Uint8Array(MAXF * MAXS),
    seeded: 0,
  });

  const forms: Form[] = S.forms;
  const E = energy;

  const place = (f: Form) => {
    f.x = Math.random() * w;
    f.y = Math.random() * h;
    f.sz = R * (0.05 + Math.random() * 0.09) * (1.55 - E * 0.95);
    f.rot = Math.random() * Math.PI * 2;
    f.vr = (Math.random() - 0.5) * 0.02;
    f.fold = Math.random();
    f.dir = Math.random() < 0.5 ? -1 : 1;
    f.fv = 0.004 + Math.random() * 0.008;
    f.sides = 4 + ((Math.random() * (MAXS - 3)) | 0);
    f.ph = Math.random() * 6.28;
    const sp = R * 0.0016;
    f.vx = (Math.random() - 0.5) * sp;
    f.vy = (Math.random() - 0.5) * sp;
  };

  if (forms.length === 0) {
    for (let i = 0; i < MAXF; i++) {
      const f: Form = {
        x: 0, y: 0, vx: 0, vy: 0, sz: 0, rot: 0, vr: 0,
        fold: 0, dir: 1, fv: 0.006, sides: 5, ph: 0, a: 0, on: 0,
      };
      place(f);
      forms.push(f);
    }
  }

  // ── population: a few large forms when calm, a swarm when driving ─────────
  const want = 3 + Math.round(E * E * (MAXF - 3));
  const foldRate = (0.0025 + E * 0.032) * cfg.speed;
  const tumble = (0.0015 + E * 0.05) * cfg.speed;
  const drift = (0.35 + E * 3.4) * cfg.speed;
  const margin = R * 0.2;

  const VX: Float32Array = S.vx, VY: Float32Array = S.vy, TONE: Uint8Array = S.tone;

  for (let i = 0; i < MAXF; i++) {
    const f = forms[i];
    f.on = i < want ? 1 : 0;
    const targetA = f.on ? 1 : 0;
    f.a += (targetA - f.a) * 0.06;
    if (f.a < 0.02) {
      if (f.on) { place(f); f.a = 0.02; }
      else continue;
    }

    // fold / unfold, bouncing at both ends of the crease travel
    f.fold += f.dir * foldRate * (0.6 + f.fv * 40);
    if (f.fold > 1) { f.fold = 1; f.dir = -1; }
    else if (f.fold < 0) { f.fold = 0; f.dir = 1; }
    if (beat) {
      // beats reverse the fold mid-motion and kick the tumble
      if (Math.random() < 0.35 + E * 0.6) f.dir = -f.dir;
      f.vr += (Math.random() - 0.5) * 0.04 * (0.4 + E) * I;
    }
    f.rot += f.vr * (0.4 + E * 2.2) + tumble * (f.sides % 2 === 0 ? 1 : -1) * 0.2;
    f.vr *= 0.985;
    f.x += f.vx * drift;
    f.y += f.vy * drift;
    if (f.x < -margin) f.x = w + margin; else if (f.x > w + margin) f.x = -margin;
    if (f.y < -margin) f.y = h + margin; else if (f.y > h + margin) f.y = -margin;

    // ── crease the sheet: alternate vertices pull toward the centre as the
    // fold closes, so a flat polygon becomes a starred/creased solid
    const n = f.sides;
    const base = i * (MAXS + 1);
    // batched fills can't carry a per-form alpha, so a form scales in and out
    // of existence instead of popping
    const scale = f.sz * (1 + beatE * 0.12) * f.a;
    for (let k = 0; k < n; k++) {
      const a = f.rot + (k / n) * Math.PI * 2;
      const alt = k % 2 === 0 ? 1 : -1;
      const pull = f.fold * (alt > 0 ? 0.1 : 0.68 + 0.22 * Math.sin(f.ph + k));
      const r = scale * (1 - pull);
      VX[base + k] = f.x + Math.cos(a) * r;
      VY[base + k] = f.y + Math.sin(a) * r * (1 - f.fold * 0.32);
      // facet shading: which way this face turns as the paper folds up
      const sh = 0.5 + 0.5 * Math.sin(a * 2 + f.fold * 3.1 + f.ph);
      let ti = (sh * TONES) | 0;
      if (ti > TONES - 1) ti = TONES - 1; else if (ti < 0) ti = 0;
      TONE[i * MAXS + k] = ti;
    }
    VX[base + n] = VX[base];
    VY[base + n] = VY[base];
  }

  // ── facets: exactly TONES fills for the whole scene ───────────────────────
  // painted, not additive: the dark side of a fold has to actually read dark
  c.globalCompositeOperation = "source-over";
  const lit = 0.34 + midV * 0.1 + beatE * 0.12;
  for (let t = 0; t < TONES; t++) {
    const tf = t / (TONES - 1);
    let any = false;
    c.beginPath();
    for (let i = 0; i < MAXF; i++) {
      const f = forms[i];
      if (f.a < 0.02) continue;
      const base = i * (MAXS + 1);
      for (let k = 0; k < f.sides; k++) {
        if (TONE[i * MAXS + k] !== t) continue;
        c.moveTo(f.x, f.y);
        c.lineTo(VX[base + k], VY[base + k]);
        c.lineTo(VX[base + k + 1], VY[base + k + 1]);
        c.closePath();
        any = true;
      }
    }
    if (!any) continue;
    // two-tone paper: shadowed faces stay dim, lit faces catch the palette
    c.fillStyle = CMix(0.12 + tf * 0.76, lit + tf * 0.3, 20 + tf * 46);
    c.fill();
  }

  // ── crease lines + outlines: one batched stroke ───────────────────────────
  c.globalCompositeOperation = "lighter";
  c.lineJoin = "round";
  glow(Math.min(18, 6 + beatE * 8 + E * 4), C1());
  c.beginPath();
  for (let i = 0; i < MAXF; i++) {
    const f = forms[i];
    if (f.a < 0.02) continue;
    const base = i * (MAXS + 1);
    for (let k = 0; k < f.sides; k++) {
      c.moveTo(f.x, f.y);
      c.lineTo(VX[base + k], VY[base + k]);
    }
    c.moveTo(VX[base], VY[base]);
    for (let k = 1; k <= f.sides; k++) c.lineTo(VX[base + k], VY[base + k]);
  }
  c.strokeStyle = C1(0.18 + E * 0.14 + beatE * 0.2, 66);
  c.lineWidth = (0.6 + E * 0.5 + beatE * 0.7) * TK;
  c.stroke();
  noGlow();
  c.lineJoin = "miter";

  // ── a soft press of light behind the swarm on the hit ─────────────────────
  if (beatE > 0.05) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, C1(beatE * 0.08, 60));
    g.addColorStop(0.5, C2(beatE * 0.05 * (0.3 + E), 50));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
};
