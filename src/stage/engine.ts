// The stage: one canvas behind the whole interface, one render loop.
//
// It plays two roles with the same picture. Immersive, it is the visualizer.
// Behind the interface it is the backdrop — dimmer, calmer, reacting less — so
// the controls and text above it stay steady and readable while the room still
// breathes with the music. Using one renderer for both is what lets opening the
// stage feel like walking into the backdrop rather than switching apps.
//
// Interface motion and music motion are kept apart on purpose: nothing in this
// file touches the DOM interface, and nothing in the interface waits for it.
import { useStore, getCurrentTrack } from "../store/useStore";
import { sig, updateSignals, smoothstep, setSensitivity } from "../flux/signals";
import { artNow, hexToRgb, rgbToHsl, hsl } from "../flux/art";
import { paletteById, type Look } from "../flux/look";
import { lineAt } from "../flux/lyricTime";
import { HEADER, FOOTER, VERT, COMPOSITE } from "./glsl";
import { MODES, modeById } from "./modes";
import type { Frame, ModeDef } from "./types";

type GL = WebGL2RenderingContext;
interface Prog { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

export interface Presence {
  /** draw at all */
  show: boolean;
  /** 0 immersive … 1 calm backdrop */
  calm: number;
  /** overall brightness 0..1 */
  dim: number;
  /** printed onto a light page */
  paper: number;
}

export const stageInfo = {
  gl: false,
  fps: 60,
  scale: 1,
  frameMs: 16.7,
  mode: "",
  error: "",
};
if (typeof window !== "undefined") (window as unknown as { __fluxStage: typeof stageInfo }).__fluxStage = stageInfo;

/** Resolve a look's colour source to five hex colours, after warmth/vivid. */
export function resolvePalette(look: Look): [string, string, string, string, string] {
  const base = look.color.source === "artwork"
    ? artNow(getCurrentTrack(useStore.getState())).palette
    : (paletteById(look.color.source)?.c ?? artNow(null).palette);
  const { warmth, vivid } = look.color;
  if (!warmth && vivid === 1) return base;
  return base.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    let [h, s, l] = rgbToHsl(r, g, b);
    if (warmth) {
      const target = warmth > 0 ? 28 : 212;
      let d = target - h;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      h += d * Math.abs(warmth) * 0.35;
    }
    s *= vivid;
    return hsl(h, s, l);
  }) as [string, string, string, string, string];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

class Stage {
  canvas: HTMLCanvasElement | null = null;
  gl: GL | null = null;
  c2d: CanvasRenderingContext2D | null = null;
  private progs = new Map<string, Prog | null>();
  private comp: Prog | null = null;
  private quad: WebGLBuffer | null = null;
  private targets: Target[] = [];
  private specTex: WebGLTexture | null = null;
  private specBytes = new Uint8Array(48);
  private canv2d = new Map<string, { cv: HTMLCanvasElement; c: CanvasRenderingContext2D }>();
  private states = new Map<string, Record<string, unknown>>();
  active = "";
  private prev = "";
  private mix = 1;
  private seed = 0;
  private time = 0;
  private pal = new Float32Array(15);
  private palTarget = new Float32Array(15);
  private palInit = false;
  private presence: Presence = { show: true, calm: 1, dim: 0.7, paper: 0 };
  private eased = { calm: 1, dim: 0, paper: 0 };
  private cssW = 1;
  private cssH = 1;
  private scale = 1;
  private frameEma = 16.7;
  private lastAdjust = 0;
  private lastFrame = 0;
  private lastRender = 0;
  private raf = 0;
  private running = false;
  private lost = false;
  private ro: ResizeObserver | null = null;

  attach(cv: HTMLCanvasElement): void {
    if (this.canvas === cv) return;
    this.detach();
    this.canvas = cv;
    cv.addEventListener("webglcontextlost", this.onLost, false);
    cv.addEventListener("webglcontextrestored", this.onRestored, false);
    this.initGL();
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(cv);
    this.measure();
    this.start();
  }

  detach(): void {
    this.stop();
    this.ro?.disconnect();
    this.ro = null;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onLost);
      this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    }
    this.releaseGL();
    this.canvas = null;
  }

  setPresence(p: Partial<Presence>): void { Object.assign(this.presence, p); }

  private onLost = (e: Event) => { e.preventDefault(); this.lost = true; stageInfo.error = "graphics context lost — restoring"; };
  private onRestored = () => { this.lost = false; stageInfo.error = ""; this.progs.clear(); this.targets = []; this.initGL(); };

  private measure(): void {
    const cv = this.canvas;
    if (!cv) return;
    this.cssW = Math.max(1, cv.clientWidth);
    this.cssH = Math.max(1, cv.clientHeight);
  }

  private initGL(): void {
    const cv = this.canvas!;
    let gl: GL | null = null;
    try {
      gl = cv.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false }) as GL | null;
    } catch { gl = null; }
    if (!gl) {
      // No WebGL2: the canvas modes still run directly on a 2D context, and
      // shader modes stand in with the nearest canvas composition.
      this.c2d = cv.getContext("2d");
      stageInfo.gl = false;
      return;
    }
    this.gl = gl;
    stageInfo.gl = true;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.comp = this.compile("__comp", COMPOSITE);
    this.specTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 48, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);
  }

  private releaseGL(): void {
    const gl = this.gl;
    if (gl) {
      for (const t of this.targets) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
      for (const p of this.progs.values()) if (p) gl.deleteProgram(p.p);
      if (this.comp) gl.deleteProgram(this.comp.p);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.targets = [];
    this.progs.clear();
    this.comp = null;
    this.gl = null;
    this.c2d = null;
  }

  private compile(id: string, frag: string): Prog | null {
    const gl = this.gl!;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        console.warn(`stage shader ${id} failed:`, log);
        stageInfo.error = `${id}: ${log?.split("\n")[0] ?? "compile error"}`;
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, frag);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn(`stage program ${id} failed:`, gl.getProgramInfoLog(p));
      return null;
    }
    return { p, loc: new Map() };
  }

  private prog(m: ModeDef): Prog | null {
    if (!this.progs.has(m.id)) this.progs.set(m.id, this.compile(m.id, HEADER + m.frag + FOOTER));
    return this.progs.get(m.id) ?? null;
  }

  private u(pr: Prog, name: string): WebGLUniformLocation | null {
    if (!pr.loc.has(name)) pr.loc.set(name, this.gl!.getUniformLocation(pr.p, name));
    return pr.loc.get(name)!;
  }

  private target(i: number, w: number, h: number): Target {
    const gl = this.gl!;
    let t = this.targets[i];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { fb, tex, w, h };
    this.targets[i] = t;
    return t;
  }

  private canvasFor(id: string, w: number, h: number) {
    let e = this.canv2d.get(id);
    if (!e) {
      const cv = document.createElement("canvas");
      e = { cv, c: cv.getContext("2d", { alpha: false })! };
      this.canv2d.set(id, e);
    }
    if (e.cv.width !== w || e.cv.height !== h) { e.cv.width = w; e.cv.height = h; }
    return e;
  }

  private stateFor(id: string): Record<string, unknown> {
    let s = this.states.get(id);
    if (!s) { s = {}; this.states.set(id, s); }
    return s;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Build the frame every mode reads, from signals + look + presence. */
  private buildFrame(dt: number, w: number, h: number, look: Look, calm: number, px: number): Frame {
    const s = useStore.getState();
    const tr = getCurrentTrack(s);
    const react = look.intensity.react * (1 - calm * 0.5);
    const k = (v: number) => Math.min(1, v * react);
    const thr = look.intensity.rhythm === "beat" ? [0.25, 0.5] : [0.45, 0.72];
    const grid = look.intensity.rhythm === "energy" ? 0 : smoothstep(thr[0], thr[1], sig.confidence);
    const accentRaw = grid * sig.pulse * (0.45 + sig.level * 0.8) + (1 - grid) * sig.transient * 0.85;
    const accent = Math.min(1, accentRaw * look.intensity.accents * 1.4 * (1 - calm * 0.55) * (look.intensity.react > 0 ? 1 : 0));
    // scene time: movement speed, nudged by energy while playing, a slow drift when paused
    const pace = sig.playing ? 0.55 + sig.energy * 0.9 : 0.12 + look.motion.drift * 0.3;
    this.time += dt * look.motion.speed * pace * (1 - calm * 0.3);
    const lines = s.lyricsOn && s.lyricPrefs.show ? tr?.lyrics : undefined;
    const lt = sig.t + s.lyricPrefs.offsetMs / 1000;
    const at = tr?.lyricsTimed === false ? null : lineAt(lines, lt);
    const line = at && at.index >= 0 ? lines![at.index] : null;
    const css = [0, 1, 2, 3, 4].map((i) => toHex(this.pal[i * 3], this.pal[i * 3 + 1], this.pal[i * 3 + 2])) as Frame["css"];
    return {
      time: this.time, dt, w, h, px, css, rgb: this.pal,
      level: k(sig.level), energy: sig.energy, sub: k(sig.sub), bass: k(sig.bass), lowMid: k(sig.lowMid),
      mid: k(sig.mid), high: k(sig.high), air: k(sig.air), transient: k(sig.transient), accent, grid,
      phase: sig.phase, barPhase: sig.barPhase, beatIndex: sig.beatIndex, onBeat: sig.onBeat, onBar: sig.onBar,
      onset: sig.onset, drop: sig.drop * react, playing: sig.playing, spectrum: sig.spectrum, wave: sig.wave,
      a: look.style.a, b: look.style.b, drift: look.motion.drift, calm,
      lyric: {
        text: line?.text ?? "", t: lt, index: at?.index ?? -1, start: at?.start ?? 0, end: at?.end ?? 0, timed: !!tr?.lyricsTimed || tr?.lyricsTimed === undefined,
        words: line?.words ? line.words.map((w, i, a) => ({ text: w.text, t: w.t, e: w.e ?? a[i + 1]?.t ?? w.t + 0.8 })) : null,
      },
      title: tr ? tr.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : "",
      artist: tr?.artist ?? "",
    };
  }

  private updatePalette(dt: number, look: Look): void {
    const hexes = resolvePalette(look);
    hexes.forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      this.palTarget[i * 3] = r / 255;
      this.palTarget[i * 3 + 1] = g / 255;
      this.palTarget[i * 3 + 2] = b / 255;
    });
    if (!this.palInit) { this.pal.set(this.palTarget); this.palInit = true; return; }
    // colours glide (≈0.9s) so a track change or a palette pick flows rather than cuts
    const a = 1 - Math.exp(-dt / 0.35);
    for (let i = 0; i < 15; i++) this.pal[i] += (this.palTarget[i] - this.pal[i]) * a;
  }

  private frame(now: number): void {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    const s = useStore.getState();
    setSensitivity(1);
    updateSignals(now);
    const look = s.look;
    this.updatePalette(dt, look);

    // ease presence so dimming and calming never snap
    const P = this.presence;
    const ez = (cur: number, to: number, tc: number) => cur + (to - cur) * (1 - Math.exp(-dt / tc));
    this.eased.calm = ez(this.eased.calm, P.calm, 0.35);
    this.eased.dim = ez(this.eased.dim, P.show ? P.dim : 0, 0.3);
    this.eased.paper = ez(this.eased.paper, P.paper, 0.4);
    if (!this.canvas || this.lost) return;
    if (this.eased.dim < 0.004) return;

    // pacing: full rate while playing or immersive; a calm, paused backdrop
    // doesn't need 60 updates a second
    const q = s.quality;
    const idle = !sig.playing && this.eased.calm > 0.5;
    const minGap = q === "saver" || idle ? 1000 / 31 : 0;
    if (now - this.lastRender < minGap) return;
    const rdt = this.lastRender ? Math.min(0.1, (now - this.lastRender) / 1000) : dt;
    this.lastRender = now;

    // quality governor on the measured interval between rendered frames
    this.frameEma += ((now - (this.prevRender || now)) - this.frameEma) * 0.08;
    this.prevRender = now;
    const maxScale = q === "high" ? 1 : q === "balanced" ? 0.75 : q === "saver" ? 0.5 : 1;
    const minScale = q === "high" ? 0.7 : 0.35;
    const budget = minGap ? minGap : 1000 / 60;
    if (q !== "high" || this.scale > maxScale) {
      if (this.frameEma > budget * 1.3 && now - this.lastAdjust > 700 && this.scale > minScale) {
        this.scale = Math.max(minScale, this.scale * 0.85); this.lastAdjust = now;
      } else if (this.frameEma < budget * 1.08 && now - this.lastAdjust > 2500 && this.scale < maxScale) {
        this.scale = Math.min(maxScale, this.scale * 1.08); this.lastAdjust = now;
      }
    }
    this.scale = Math.min(this.scale, maxScale);
    stageInfo.scale = +this.scale.toFixed(2);
    stageInfo.frameMs = +this.frameEma.toFixed(1);
    stageInfo.fps = Math.round(1000 / Math.max(1, this.frameEma));

    const dpr = Math.min(window.devicePixelRatio || 1, q === "saver" ? 1 : 2);
    // the calm backdrop sits under UI and a blur of distance: it can afford
    // fewer pixels than the immersive stage
    const px = dpr * this.scale * (1 - this.eased.calm * 0.35);
    const w = Math.max(2, Math.round(this.cssW * px));
    const h = Math.max(2, Math.round(this.cssH * px));
    const cv = this.canvas;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

    // mode switching — interruptible: a switch during a barely-started
    // transition replaces the incoming scene, otherwise the current scene
    // becomes the outgoing one
    const want = look.style.mode;
    if (!this.active) this.active = want;
    if (want !== this.active) {
      if (this.mix < 0.35 && this.prev) this.active = want;
      else { this.prev = this.active; this.active = want; this.mix = 0; this.seed = Math.random() * 50; }
    }
    const motion = s.ui.motion;
    const dur = motion === "minimal" ? 0.35 : motion === "calm" ? 0.9 : 1.5;
    if (this.mix < 1) this.mix = Math.min(1, this.mix + rdt / dur);
    if (this.mix >= 1) this.prev = "";
    stageInfo.mode = this.active;

    const frame = this.buildFrame(rdt, w, h, look, this.eased.calm, px);
    if (this.gl) this.renderGL(frame);
    else this.render2D(frame);
  }
  private prevRender = 0;

  private renderMode(m: ModeDef, slot: number, f: Frame): void {
    const gl = this.gl!;
    const t = this.target(slot, f.w, f.h);
    const st = this.stateFor(m.id);
    if (m.kind === "gl") {
      const pr = this.prog(m);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, f.w, f.h);
      if (!pr) { gl.clearColor(f.rgb[0], f.rgb[1], f.rgb[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
      gl.useProgram(pr.p);
      const set1 = (n: string, v: number) => gl.uniform1f(this.u(pr, n), v);
      gl.uniform2f(this.u(pr, "uRes"), f.w, f.h);
      set1("uTime", f.time); set1("uLevel", f.level); set1("uEnergy", f.energy);
      set1("uSub", f.sub); set1("uBass", f.bass); set1("uLowMid", f.lowMid); set1("uMid", f.mid);
      set1("uHigh", f.high); set1("uAir", f.air); set1("uTransient", f.transient); set1("uAccent", f.accent);
      set1("uGrid", f.grid); set1("uPhase", f.phase); set1("uBarPhase", f.barPhase); set1("uDrop", f.drop);
      set1("uA", f.a); set1("uB", f.b); set1("uDrift", f.drift); set1("uCalm", f.calm);
      gl.uniform3fv(this.u(pr, "uPal"), f.rgb);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.specTex);
      gl.uniform1i(this.u(pr, "uSpec"), 2);
      const extra = m.uniforms?.(f, st);
      if (extra) for (const [k, v] of Object.entries(extra)) {
        const loc = this.u(pr, k);
        if (Array.isArray(v)) gl.uniform4fv(loc, v); else gl.uniform1f(loc, v);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      const e = this.canvasFor(m.id, f.w, f.h);
      e.c.setTransform(1, 0, 0, 1, 0, 0);
      m.draw!(e.c, f, st);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, e.cv);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  }

  private renderGL(f: Frame): void {
    const gl = this.gl!;
    for (let i = 0; i < 48; i++) this.specBytes[i] = Math.round(Math.min(1, f.spectrum[i]) * 255);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 48, 1, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);
    gl.activeTexture(gl.TEXTURE0);
    this.renderMode(modeById(this.active), 0, f);
    if (this.prev) {
      gl.activeTexture(gl.TEXTURE0);
      this.renderMode(modeById(this.prev), 1, f);
    }
    const pr = this.comp;
    if (!pr) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, f.w, f.h);
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].tex);
    gl.uniform1i(this.u(pr, "uA"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prev ? this.targets[1].tex : this.targets[0].tex);
    gl.uniform1i(this.u(pr, "uB"), 1);
    gl.uniform2f(this.u(pr, "uRes"), f.w, f.h);
    gl.uniform1f(this.u(pr, "uMix"), this.prev ? this.mix : 1);
    gl.uniform1f(this.u(pr, "uTime"), f.time);
    gl.uniform1f(this.u(pr, "uSeed"), this.seed);
    const tex = useStore.getState().look.intensity.texture;
    gl.uniform1f(this.u(pr, "uGrain"), tex * 0.07);
    gl.uniform1f(this.u(pr, "uVignette"), 0.25 + tex * 0.6);
    gl.uniform1f(this.u(pr, "uDim"), this.eased.dim);
    gl.uniform1f(this.u(pr, "uPaper"), this.eased.paper);
    gl.uniform3f(this.u(pr, "uPaperCol"), 0.95, 0.93, 0.89);
    gl.uniform3f(this.u(pr, "uEdge"), f.rgb[9], f.rgb[10], f.rgb[11]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** No WebGL2: canvas modes draw straight to the stage; shader modes fall back. */
  private render2D(f: Frame): void {
    const c = this.c2d;
    if (!c) return;
    let m = modeById(this.active);
    if (m.kind === "gl") m = modeById(m.id === "ink" ? "signal" : m.id === "caustic" ? "orbit" : "ridge");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    m.draw!(c, f, this.stateFor(m.id));
    c.globalAlpha = 1 - this.eased.dim;
    c.fillStyle = "#000";
    c.fillRect(0, 0, f.w, f.h);
    c.globalAlpha = 1;
  }

  // ── thumbnails ───────────────────────────────────────────────────────────
  private thumbs = new Map<string, string>();
  private thumbQueue: { key: string; look: Look; w: number; h: number; resolve: (u: string) => void }[] = [];
  private thumbBusy = false;

  /** A still of a look, rendered offscreen with a representative musical moment. */
  thumbnail(look: Look, w = 320, h = 200): Promise<string> {
    const pal = resolvePalette(look).join("");
    const key = `${look.style.mode}|${look.style.a.toFixed(2)}|${look.style.b.toFixed(2)}|${pal}|${w}x${h}`;
    const hit = this.thumbs.get(key);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      this.thumbQueue.push({ key, look, w, h, resolve });
      this.pumpThumbs();
    });
  }

  private pumpThumbs(): void {
    if (this.thumbBusy || !this.thumbQueue.length) return;
    this.thumbBusy = true;
    const run = () => {
      const job = this.thumbQueue.shift();
      if (!job) { this.thumbBusy = false; return; }
      let url = "";
      try { url = this.renderThumb(job.look, job.w, job.h); } catch (e) { console.warn("thumbnail failed", e); }
      if (url) this.thumbs.set(job.key, url);
      job.resolve(url);
      // one per idle slice, so a gallery of previews never stalls a frame
      const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: unknown) => void }).requestIdleCallback;
      if (ric) ric(run, { timeout: 120 }); else setTimeout(run, 16);
    };
    // start in idle time too, so opening a gallery never blocks its first frame
    const ric0 = (window as unknown as { requestIdleCallback?: (f: () => void, o?: unknown) => void }).requestIdleCallback;
    if (ric0) ric0(run, { timeout: 120 }); else setTimeout(run, 16);
  }

  private renderThumb(look: Look, w: number, h: number): string {
    const m = modeById(look.style.mode);
    const hexes = resolvePalette(look);
    const rgb = new Float32Array(15);
    hexes.forEach((hex, i) => { const [r, g, b] = hexToRgb(hex); rgb[i * 3] = r / 255; rgb[i * 3 + 1] = g / 255; rgb[i * 3 + 2] = b / 255; });
    const spectrum = new Float32Array(48).map((_, i) => Math.max(0, 0.75 - i / 64 + Math.sin(i * 0.7) * 0.12));
    const f: Frame = {
      time: 14.2, dt: 0.1, w, h, px: 1, css: hexes, rgb,
      level: 0.55, energy: 0.55, sub: 0.5, bass: 0.55, lowMid: 0.45, mid: 0.4, high: 0.35, air: 0.3,
      transient: 0.3, accent: 0.35, grid: 0.8, phase: 0.12, barPhase: 0.28, beatIndex: 9, onBeat: false, onBar: false,
      onset: false, drop: 0, playing: true, spectrum, wave: new Float32Array(256),
      a: look.style.a, b: look.style.b, drift: look.motion.drift, calm: 0,
      // a sample sung line, so a preview of a lyric-led mode shows its type
      lyric: {
        text: "Hold the light a little longer", t: 1.1, start: 0, end: 3, index: 0, timed: true,
        words: "Hold the light a little longer".split(" ").map((w, i) => ({ text: w, t: i * 0.4, e: i * 0.4 + 0.4 })),
      },
      title: "Flux", artist: "Flux",
    };
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const oc = out.getContext("2d")!;
    if (m.kind === "2d") {
      const st: Record<string, unknown> = {};
      // warm the mode up so stateful ones (ridges, coronas) look lived-in
      for (let i = 0; i < 40; i++) { f.time += 0.1; f.onBar = i % 8 === 0; m.draw!(oc, f, st); }
      return out.toDataURL("image/jpeg", 0.82);
    }
    const gl = this.gl;
    if (!gl) return "";
    const pr = this.prog(m);
    if (!pr) return "";
    const t = this.target(5, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr.p);
    const set1 = (n: string, v: number) => gl.uniform1f(this.u(pr, n), v);
    gl.uniform2f(this.u(pr, "uRes"), w, h);
    set1("uTime", f.time); set1("uLevel", f.level); set1("uEnergy", f.energy); set1("uSub", f.sub);
    set1("uBass", f.bass); set1("uLowMid", f.lowMid); set1("uMid", f.mid); set1("uHigh", f.high); set1("uAir", f.air);
    set1("uTransient", f.transient); set1("uAccent", f.accent); set1("uGrid", f.grid); set1("uPhase", f.phase);
    set1("uBarPhase", f.barPhase); set1("uDrop", 0); set1("uA", f.a); set1("uB", f.b); set1("uDrift", f.drift); set1("uCalm", 0);
    gl.uniform3fv(this.u(pr, "uPal"), rgb);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.uniform1i(this.u(pr, "uSpec"), 2);
    if (m.uniforms) {
      const extra = m.uniforms(f, {});
      for (const [k, v] of Object.entries(extra)) {
        const loc = this.u(pr, k);
        if (Array.isArray(v)) gl.uniform4fv(loc, v); else gl.uniform1f(loc, v);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const img = oc.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    oc.putImageData(img, 0, 0);
    return out.toDataURL("image/jpeg", 0.82);
  }
}

export const stage = new Stage();
if (typeof window !== "undefined") (window as unknown as { __fluxStageEngine: Stage }).__fluxStageEngine = stage;
export { MODES };
