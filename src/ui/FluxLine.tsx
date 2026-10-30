// The Flux line — the scrubber.
//
// It is the track's own waveform. Hovering lays a lens over it: the bars under
// the pointer swell, so you can see what you're about to land on. Dragging
// follows the hand exactly and shows the target time; on release the playhead
// *travels* to the new position with a spring and a ring marks where it
// landed, so a seek reads as a jump you made rather than a glitch. When the
// track changes, the bars morph from the old waveform into the new one, left
// to right. While buffering, a shimmer runs along the played part.
//
// Progress is drawn from the shared clock every frame, not from the 4Hz
// `timeupdate`, which is why it glides instead of ticking.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clock } from "../flux/clock";
import { getAnalysis } from "../flux/signals";
import { seek } from "../audio/transport";
import { useStore } from "../store/useStore";
import type { Track } from "../types";
import { fmt } from "../utils";
import { spring } from "./motion";

export function FluxLine({ track, height = 44, compact }: { track: Track | null; height?: number; compact?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const curLabel = useRef<HTMLSpanElement>(null);
  const durLabel = useRef<HTMLSpanElement>(null);
  const duration = useStore((s) => s.duration);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ring, setRing] = useState<{ id: number; x: number } | null>(null);
  const st = useRef({
    hover: -1, lens: 0, drag: false, dragT: 0, disp: -1, vel: 0,
    from: [] as number[], to: [] as number[], morph: 1, trackId: "", colors: { a: "", dim: "", text: "" }, colorAt: 0,
  });

  // track change → morph the bars from the old waveform to the new
  useEffect(() => {
    const s = st.current;
    const N = 120;
    const sample = (pk?: number[]) => Array.from({ length: N }, (_, i) => {
      if (!pk?.length) return 0.18 + 0.1 * Math.sin(i * 0.37) * Math.sin(i * 0.11);
      const a = (i / N) * pk.length;
      const k = Math.floor(a);
      return pk[Math.min(pk.length - 1, k)] * (1 - (a - k)) + pk[Math.min(pk.length - 1, k + 1)] * (a - k);
    });
    const next = sample(track?.peaks);
    if (s.trackId !== (track?.id ?? "") || s.to.length !== N) {
      s.from = s.to.length === N ? currentBars(s) : next.map(() => 0);
      s.to = next;
      s.morph = 0;
      s.trackId = track?.id ?? "";
      s.disp = -1;
    } else {
      // peaks arrived for the same track: morph from the placeholder
      s.from = currentBars(s);
      s.to = next;
      s.morph = 0;
    }
  }, [track?.id, track?.peaks]);

  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      drawRef.current();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // draw() closes over the latest props; the loop always calls the newest one
  drawRef.current = draw;

  function draw() {
    const c = cv.current, w = wrap.current;
    if (!c || !w) return;
    const s = st.current;
    const W = w.clientWidth, H = height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = `${W}px`; c.style.height = `${H}px`;
    }
    const now = performance.now();
    if (now - s.colorAt > 400) {
      const cs = getComputedStyle(w);
      s.colors = { a: cs.getPropertyValue("--accent").trim(), dim: cs.getPropertyValue("--text-3").trim(), text: cs.getPropertyValue("--text").trim() };
      s.colorAt = now;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const dur = duration || 0;
    const t = s.drag ? s.dragT : clock.audible();
    // displayed position: springs toward the real one after a seek, otherwise rides it
    const target = dur > 0 ? Math.min(1, t / dur) : 0;
    if (s.disp < 0 || s.drag) { s.disp = target; s.vel = 0; }
    else {
      const k = 260, dmp = 30, dt = 1 / 60;
      const a = k * (target - s.disp) - dmp * s.vel;
      s.vel += a * dt;
      s.disp += s.vel * dt;
      if (Math.abs(target - s.disp) < 0.0004 && Math.abs(s.vel) < 0.001) { s.disp = target; s.vel = 0; }
    }
    s.lens += ((s.hover >= 0 || s.drag ? 1 : 0) - s.lens) * 0.2;
    s.morph = Math.min(1, s.morph + 1 / 40);
    const N = s.to.length;
    const gap = 2;
    const bw = Math.max(1, (W - gap * (N - 1)) / N);
    const mid = H / 2;
    const hx = s.drag ? s.disp * W : s.hover;
    for (let i = 0; i < N; i++) {
      // staggered morph, left to right
      const mk = Math.min(1, Math.max(0, s.morph * 1.6 - (i / N) * 0.6));
      const e = 1 - Math.pow(1 - mk, 3);
      const v = (s.from[i] ?? 0) * (1 - e) + s.to[i] * e;
      const x = i * (bw + gap);
      const lensK = hx >= 0 ? Math.exp(-Math.pow((x + bw / 2 - hx) / 46, 2)) * s.lens : 0;
      const bh = Math.max(2, (0.18 + v * 0.82) * (H * (compact ? 0.62 : 0.5)) * (1 + lensK * 0.7));
      const played = (x + bw / 2) / W <= s.disp;
      ctx.fillStyle = played ? s.colors.a : s.colors.dim;
      ctx.globalAlpha = played ? 1 : 0.55 + lensK * 0.45;
      const r = Math.min(bw / 2, 2);
      roundRect(ctx, x, mid - bh / 2, bw, bh, r);
    }
    ctx.globalAlpha = 1;
    // buffering shimmer over the played region
    if (clock.buffering && clock.playing) {
      const px = s.disp * W;
      const sx = ((now / 900) % 1) * (px + 80) - 40;
      const g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, H);
      ctx.globalCompositeOperation = "source-over";
    }
    // drop markers: where the analysis found the track lifting
    const A = getAnalysis();
    if (A && dur > 0 && !compact) {
      ctx.fillStyle = s.colors.text;
      ctx.globalAlpha = 0.5;
      for (const d of A.drops) {
        const x = (d / dur) * W;
        ctx.beginPath(); ctx.arc(x, 2.5, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // playhead
    const px = s.disp * W;
    ctx.fillStyle = s.colors.text;
    roundRect(ctx, px - 1, mid - H * 0.42, 2, H * 0.84, 1);
    if (curLabel.current) curLabel.current.textContent = fmt(dur > 0 ? s.disp * dur : 0);
    if (durLabel.current) durLabel.current.textContent = dur > 0 ? `-${fmt(Math.max(0, dur - s.disp * dur))}` : "0:00";
  }

  const xToT = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (duration || 0);
  };
  const onDown = (e: React.PointerEvent) => {
    if (!duration) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.current.drag = true;
    st.current.dragT = xToT(e.clientX);
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    st.current.hover = x;
    setHoverX(x);
    if (st.current.drag) st.current.dragT = xToT(e.clientX);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s.drag) return;
    s.drag = false;
    setDragging(false);
    const t = xToT(e.clientX);
    // keep the displayed position where the hand left it; the spring carries
    // it if the clock lands somewhere slightly different
    s.disp = duration ? t / duration : 0;
    seek(t);
    const r = wrap.current!.getBoundingClientRect();
    setRing({ id: Date.now(), x: e.clientX - r.left });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = clock.media();
    let to: number | null = null;
    if (e.key === "ArrowRight") to = t + (e.shiftKey ? 15 : 5);
    else if (e.key === "ArrowLeft") to = t - (e.shiftKey ? 15 : 5);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = Math.max(0, duration - 1);
    if (to === null) return;
    e.preventDefault();
    seek(Math.min(Math.max(0, to), duration || 0));
  };
  const hoverT = hoverX !== null && wrap.current ? (hoverX / wrap.current.clientWidth) * (duration || 0) : 0;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        ref={wrap}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(clock.media())}
        aria-valuetext={`${fmt(clock.media())} of ${fmt(duration || 0)}`}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => { st.current.hover = -1; setHoverX(null); }}
        onKeyDown={onKey}
        style={{ position: "relative", height, cursor: duration ? "pointer" : "default", touchAction: "none", borderRadius: 8 }}
      >
        <canvas ref={cv} style={{ display: "block" }} />
        <AnimatePresence>
          {(hoverX !== null || dragging) && duration > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1, left: dragging ? `${(st.current.dragT / duration) * 100}%` : hoverX ?? 0 }}
              exit={{ opacity: 0, y: 6, scale: 0.9 }}
              transition={{ ...spring.snap, left: { duration: 0 } }}
              className="mono"
              style={{
                position: "absolute", bottom: height + 2, x: "-50%", padding: "4px 8px", borderRadius: 8,
                background: dragging ? "var(--accent)" : "var(--text)", color: dragging ? "var(--on-accent)" : "var(--bg)",
                fontSize: 11.5, fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2,
              }}
            >{fmt(dragging ? st.current.dragT : hoverT)}</motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {ring && (
            <motion.div
              key={ring.id}
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setRing(null)}
              style={{
                position: "absolute", left: ring.x - 14, top: height / 2 - 14, width: 28, height: 28, borderRadius: "50%",
                border: "2px solid var(--accent)", pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>
      </div>
      {!compact && (
        <div className="mono faint" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
          <span ref={curLabel}>0:00</span>
          <span ref={durLabel}>0:00</span>
        </div>
      )}
    </div>
  );
}

function currentBars(s: { from: number[]; to: number[]; morph: number }): number[] {
  const e = 1 - Math.pow(1 - s.morph, 3);
  return s.to.map((v, i) => (s.from[i] ?? 0) * (1 - e) + v * e);
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.fill();
}
