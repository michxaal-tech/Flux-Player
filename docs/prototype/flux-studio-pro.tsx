import { useState, useRef, useEffect, useCallback } from "react";

// ═══ FLUX STUDIO PRO — MAX VISUAL EDITION ═══════════════════════════
// 20 visualizer themes · 15 palettes · 15 tune controls.
// Player, DJ deck, FX rack, library, personal profile, recording.

const CYAN = "#53E9FF";
const MAG = "#FF4ECD";
const BG = "#08090D";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "1px solid rgba(255,255,255,0.09)";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');
* { box-sizing: border-box; margin: 0; }
button { font-family: 'Space Grotesk', sans-serif; }
input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; height: 22px; width: 100%; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: #22252d; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; background: ${CYAN}; margin-top: -5.5px; cursor: pointer; box-shadow: 0 0 10px rgba(83,233,255,.55); }
input[type=text], textarea { font-family: 'Space Grotesk', sans-serif; }
::-webkit-scrollbar { width: 5px; height: 5px; } ::-webkit-scrollbar-thumb { background: #2a2e38; border-radius: 3px; }
.hscroll::-webkit-scrollbar { display: none; }
.pgrid { display: grid; grid-template-columns: 1fr; gap: 16px; max-width: 1020px; margin: 0 auto; width: 100%; }
@media (min-width: 760px) { .pgrid { grid-template-columns: 1fr 310px; align-items: start; } }
`;

const cleanName = (n) => n.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
const fmt = (t) => { if (!isFinite(t)) return "0:00"; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s < 10 ? "0" : ""}${s}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const TAGS = ["HYPE", "CHILL", "FOCUS", "SAD", "WORKOUT", "NIGHT"];
const LEVELS = [
  { min: 0, name: "SHOWER SINGER" }, { min: 5, name: "BEDROOM LISTENER" }, { min: 15, name: "CRATE DIGGER" },
  { min: 30, name: "SELECTOR" }, { min: 60, name: "RESIDENT DJ" }, { min: 120, name: "SOUND ARCHITECT" }, { min: 240, name: "FLUX LEGEND" },
];

const DEFAULT_FX = {
  speed: 1, vinyl: false, reverb: 0, size: 2.2,
  echoMix: 0, echoTime: 0.28, echoFb: 0.35,
  bass: 0, mid: 0, treble: 0, spin: false, spinRate: 0.55,
  crackle: 0, crush: 0, tone: 20000, highpass: 20,
  vocalCut: false, boost: 1,
};

const PRESETS = [
  { name: "CLEAN", fx: {} },
  { name: "SLOWED+REVERB", fx: { speed: 0.8, vinyl: true, reverb: 0.5, size: 3.2, bass: 3 } },
  { name: "NIGHTCORE", fx: { speed: 1.27, vinyl: true, treble: 2, reverb: 0.12 } },
  { name: "8D", fx: { spin: true, spinRate: 0.55, reverb: 0.25, size: 2.6 } },
  { name: "VINYL '72", fx: { crackle: 0.55, tone: 6500, bass: 2, treble: -3, speed: 0.99, vinyl: true } },
  { name: "HALL", fx: { reverb: 0.65, size: 4.4, echoMix: 0.12, echoTime: 0.21 } },
  { name: "BASS CANNON", fx: { bass: 9, crush: 0.3, reverb: 0.08, boost: 1.25 } },
  { name: "UNDERWATER", fx: { tone: 750, reverb: 0.4, size: 3.5, speed: 0.92, vinyl: true } },
  { name: "DIAL TONE", fx: { tone: 3400, highpass: 350, bass: -10, treble: -6, crush: 0.4 } },
  { name: "PHONK", fx: { speed: 0.86, vinyl: true, bass: 6, crackle: 0.3, crush: 0.2, reverb: 0.3 } },
  { name: "KARAOKE", fx: { vocalCut: true, reverb: 0.2, size: 2.4 } },
];

const VIS_THEMES = ["RING", "KALEIDO", "HELIX", "WAVES", "LASERS", "GRID", "ORB", "RIPPLES", "SPIRAL", "FIREFLIES", "CITY", "VORTEX", "SCOPE", "AURORA", "DOTGRID", "BARS", "NEBULA", "TUNNEL", "STARFIELD", "CLOCK"];
const PALETTES = [
  { id: "NEON", h: [187, 317], s: 100 },
  { id: "SUNSET", h: [18, 330], s: 95 },
  { id: "EMBER", h: [8, 44], s: 95 },
  { id: "MATRIX", h: [128, 155], s: 90 },
  { id: "ICE", h: [198, 225], s: 85 },
  { id: "GOLD", h: [44, 58], s: 90 },
  { id: "VAPOR", h: [265, 168], s: 90 },
  { id: "LAVA", h: [0, 28], s: 100 },
  { id: "OCEAN", h: [192, 252], s: 90 },
  { id: "FOREST", h: [92, 152], s: 80 },
  { id: "CANDY", h: [302, 188], s: 95 },
  { id: "ROSE", h: [340, 18], s: 90 },
  { id: "TOXIC", h: [82, 300], s: 100 },
  { id: "GHOST", h: [0, 0], s: 4 },
  { id: "CUSTOM", h: null, s: 100 },
];
const P_STYLES = ["RISE", "SNOW", "DUST", "EMBERS"];

export default function FluxStudioPro() {
  const [playlists, setPlaylists] = useState([{ id: "main", name: "MAIN", tracks: [] }]);
  const [viewMode, setViewMode] = useState({ type: "pl", id: "main" });
  const [playPl, setPlayPl] = useState("main");
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("player");
  const [fx, setFx] = useState({ ...DEFAULT_FX });
  const [amb, setAmb] = useState({ rain: 0, fire: 0, wind: 0 });
  const [activePreset, setActivePreset] = useState("CLEAN");
  const [userPresets, setUserPresets] = useState([]);
  const [volume, setVolume] = useState(0.85);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("all");
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);
  const [visOpen, setVisOpen] = useState(false);
  const [visTheme, setVisTheme] = useState("RING");
  const [visCfg, setVisCfg] = useState({
    palette: "NEON", h1: 187, h2: 317,
    glow: 0.7, trail: 0.55, particles: 0.35, pStyle: "RISE",
    speed: 1, intensity: 1, zoom: 1, spinV: 0, bgWash: 0.3, thick: 1,
    mirror: false, shake: false, flash: true, autoCycle: false,
  });
  const [visPanel, setVisPanel] = useState(false);
  const [sleepEnd, setSleepEnd] = useState(null);
  const [sleepLeft, setSleepLeft] = useState("");
  const [rowMenu, setRowMenu] = useState(null);
  const [cues, setCues] = useState([null, null, null, null]);
  const [smooth, setSmooth] = useState(true);
  const [recState, setRecState] = useState("idle");
  const [recTime, setRecTime] = useState(0);
  const [exports, setExports] = useState([]);
  const [stats, setStats] = useState({ plays: 0, seconds: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("added");
  const [noteOpen, setNoteOpen] = useState(false);
  const [, force] = useState(0);

  const audioRef = useRef(null);
  const nodes = useRef(null);
  const bgRef = useRef(null);
  const waveRef = useRef(null);
  const discRef = useRef(null);
  const visRef = useRef(null);
  const bpmRef = useRef(null);
  const levelRef = useRef(null);
  const rafRef = useRef(0);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recChunks = useRef([]);
  const stutterIv = useRef(null);
  const brakeAnim = useRef(false);
  const setVisThemeRef = useRef(setVisTheme);

  const live = useRef({
    playing: false, speed: 1, spin: false, spinRate: 0.55, visOpen: false, visTheme: "RING",
    cfg: null, rot: 0, vt: 0, tunnel: [], stars: [], vparts: [], specHist: [], ripples: [],
    flies: [], vort: [], cityH: [], shakeVal: 0,
    beatAvg: 0, beatCool: 0, beats: [], bpm: 0, flashVal: 0, cycleT: 0,
  });
  live.current.playing = playing;
  live.current.speed = fx.speed;
  live.current.spin = fx.spin;
  live.current.spinRate = fx.spinRate;
  live.current.visOpen = visOpen;
  live.current.visTheme = visTheme;
  live.current.cfg = visCfg;

  const loopRef = useRef({ a: null, b: null });
  loopRef.current = { a: loopA, b: loopB };
  const repeatRef = useRef(repeat); repeatRef.current = repeat;

  const playingList = playlists.find((p) => p.id === playPl) || playlists[0];
  const track = current >= 0 ? playingList.tracks[current] : null;
  const viewingPlId = viewMode.type === "pl" ? viewMode.id : null;
  const viewingList = playlists.find((p) => p.id === viewingPlId);

  // ═══ AUDIO GRAPH ═══
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (nodes.current) { if (nodes.current.ctx.state === "suspended") nodes.current.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(audioRef.current);

    const shaper = ctx.createWaveShaper();
    const eqLow = ctx.createBiquadFilter(); eqLow.type = "lowshelf"; eqLow.frequency.value = 130;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.Q.value = 0.9;
    const eqHigh = ctx.createBiquadFilter(); eqHigh.type = "highshelf"; eqHigh.frequency.value = 7500;
    const toneLP = ctx.createBiquadFilter(); toneLP.type = "lowpass"; toneLP.frequency.value = 20000;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 20;

    const vDry = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    const gL = ctx.createGain(); gL.gain.value = 1;
    const gR = ctx.createGain(); gR.gain.value = -1;
    const vSum = ctx.createGain(); vSum.gain.value = 0;
    const post = ctx.createGain();

    const dry = ctx.createGain();
    const convolver = ctx.createConvolver();
    const wet = ctx.createGain(); wet.gain.value = 0;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.28;
    const delayFb = ctx.createGain(); delayFb.gain.value = 0.35;
    const delayMix = ctx.createGain(); delayMix.gain.value = 0;

    const master = ctx.createGain();
    const fader = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.82;
    const streamDest = ctx.createMediaStreamDestination();

    src.connect(shaper); shaper.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
    eqHigh.connect(toneLP); toneLP.connect(hp);
    hp.connect(vDry); vDry.connect(post);
    hp.connect(split); split.connect(gL, 0); split.connect(gR, 1); gL.connect(vSum); gR.connect(vSum); vSum.connect(post);
    post.connect(dry); dry.connect(master);
    post.connect(convolver); convolver.connect(wet); wet.connect(master);
    post.connect(delay); delay.connect(delayMix); delayMix.connect(master);
    delay.connect(delayFb); delayFb.connect(delay);
    master.connect(fader); fader.connect(panner); panner.connect(comp); comp.connect(analyser);
    analyser.connect(ctx.destination); analyser.connect(streamDest);

    const mkNoise = (fill) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      fill(b.getChannelData(0));
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start();
      return s;
    };
    const cSrc = mkNoise((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.012; });
    const cLP = ctx.createBiquadFilter(); cLP.type = "lowpass"; cLP.frequency.value = 6000;
    const cGain = ctx.createGain(); cGain.gain.value = 0;
    cSrc.connect(cLP); cLP.connect(cGain); cGain.connect(master);

    const rainSrc = mkNoise((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    const rainBP = ctx.createBiquadFilter(); rainBP.type = "bandpass"; rainBP.frequency.value = 2600; rainBP.Q.value = 0.5;
    const rainG = ctx.createGain(); rainG.gain.value = 0;
    rainSrc.connect(rainBP); rainBP.connect(rainG); rainG.connect(fader);

    const fireSrc = mkNoise((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.004 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.05; });
    const fireLP = ctx.createBiquadFilter(); fireLP.type = "lowpass"; fireLP.frequency.value = 1100;
    const fireG = ctx.createGain(); fireG.gain.value = 0;
    fireSrc.connect(fireLP); fireLP.connect(fireG); fireG.connect(fader);

    const windSrc = mkNoise((d) => { let last = 0; for (let i = 0; i < d.length; i++) { last = last + (Math.random() * 2 - 1) * 0.02; last *= 0.997; d[i] = last * 3; } });
    const windLP = ctx.createBiquadFilter(); windLP.type = "lowpass"; windLP.frequency.value = 350;
    const windLFO = ctx.createOscillator(); windLFO.frequency.value = 0.07;
    const windLFOg = ctx.createGain(); windLFOg.gain.value = 160;
    windLFO.connect(windLFOg); windLFOg.connect(windLP.frequency); windLFO.start();
    const windG = ctx.createGain(); windG.gain.value = 0;
    windSrc.connect(windLP); windLP.connect(windG); windG.connect(fader);

    nodes.current = { ctx, shaper, eqLow, eqMid, eqHigh, toneLP, hp, vDry, vSum, dry, convolver, wet, delay, delayFb, delayMix, master, fader, panner, comp, analyser, streamDest, cGain, rainG, fireG, windG };
    buildImpulse(2.2); setCurve(0);
  }, []);

  const buildImpulse = (sec) => {
    const n = nodes.current; if (!n) return;
    const rate = n.ctx.sampleRate, len = Math.max(1, Math.floor(rate * sec));
    const buf = n.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    n.convolver.buffer = buf;
  };
  const setCurve = (amt) => {
    const n = nodes.current; if (!n) return;
    const k = amt * 40, c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = k === 0 ? x : Math.tanh(x * (1 + k)) / Math.tanh(1 + k); }
    n.shaper.curve = c;
  };

  useEffect(() => {
    const el = audioRef.current;
    if (el && !brakeAnim.current) {
      el.playbackRate = fx.speed;
      try { el.preservesPitch = !fx.vinyl; el.mozPreservesPitch = !fx.vinyl; el.webkitPreservesPitch = !fx.vinyl; } catch {}
    }
    const n = nodes.current; if (!n) return;
    const t0 = n.ctx.currentTime;
    n.wet.gain.setTargetAtTime(fx.reverb, t0, 0.05);
    n.dry.gain.setTargetAtTime(1 - fx.reverb * 0.35, t0, 0.05);
    n.delayMix.gain.setTargetAtTime(fx.echoMix, t0, 0.05);
    n.delay.delayTime.setTargetAtTime(fx.echoTime, t0, 0.05);
    n.delayFb.gain.setTargetAtTime(Math.min(0.85, fx.echoFb), t0, 0.05);
    n.eqLow.gain.setTargetAtTime(fx.bass, t0, 0.05);
    n.eqMid.gain.setTargetAtTime(fx.mid, t0, 0.05);
    n.eqHigh.gain.setTargetAtTime(fx.treble, t0, 0.05);
    n.toneLP.frequency.setTargetAtTime(fx.tone, t0, 0.05);
    n.hp.frequency.setTargetAtTime(fx.highpass, t0, 0.05);
    n.cGain.gain.setTargetAtTime(fx.crackle * 0.5, t0, 0.05);
    n.vDry.gain.setTargetAtTime(fx.vocalCut ? 0 : 1, t0, 0.03);
    n.vSum.gain.setTargetAtTime(fx.vocalCut ? 0.9 : 0, t0, 0.03);
    n.master.gain.setTargetAtTime(fx.boost, t0, 0.05);
    if (!fx.spin) n.panner.pan.setTargetAtTime(0, t0, 0.1);
    setCurve(fx.crush);
  }, [fx]);
  useEffect(() => { buildImpulse(fx.size); }, [fx.size]); // eslint-disable-line
  useEffect(() => {
    const n = nodes.current; if (!n) return;
    const t0 = n.ctx.currentTime;
    n.rainG.gain.setTargetAtTime(amb.rain * 0.22, t0, 0.1);
    n.fireG.gain.setTargetAtTime(amb.fire * 0.5, t0, 0.1);
    n.windG.gain.setTargetAtTime(amb.wind * 0.6, t0, 0.1);
  }, [amb]);

  const setF = (k, v) => { setFx((p) => ({ ...p, [k]: v })); setActivePreset(""); };
  const setV = (k, v) => setVisCfg((p) => ({ ...p, [k]: v }));
  const applyPreset = (p) => { setFx({ ...DEFAULT_FX, ...p.fx }); setActivePreset(p.name); };
  const saveUserPreset = () => {
    const name = `MY-${userPresets.length + 1}`;
    setUserPresets((u) => [...u, { name, fx: { ...fx } }]);
    setActivePreset(name);
  };
  const chaos = () => {
    setFx({ ...DEFAULT_FX,
      speed: 0.7 + Math.random() * 0.7, vinyl: Math.random() < 0.6,
      reverb: Math.random() * 0.6, size: 1.5 + Math.random() * 3,
      echoMix: Math.random() < 0.5 ? 0 : Math.random() * 0.4, echoTime: 0.1 + Math.random() * 0.4, echoFb: Math.random() * 0.55,
      bass: Math.floor(Math.random() * 10) - 2, treble: Math.floor(Math.random() * 8) - 4,
      spin: Math.random() < 0.3, spinRate: 0.3 + Math.random() * 0.8,
      crackle: Math.random() < 0.4 ? Math.random() * 0.6 : 0, crush: Math.random() < 0.4 ? Math.random() * 0.5 : 0,
      tone: Math.random() < 0.3 ? 800 + Math.random() * 6000 : 20000,
    });
    setActivePreset("??");
  };
  const visChaos = () => {
    const pal = PALETTES[Math.floor(Math.random() * (PALETTES.length - 1))];
    setVisCfg((p) => ({
      ...p, palette: pal.id,
      glow: 0.3 + Math.random() * 0.7, trail: Math.random() * 0.9, particles: Math.random(),
      pStyle: P_STYLES[Math.floor(Math.random() * P_STYLES.length)],
      speed: 0.5 + Math.random() * 1.2, intensity: 0.7 + Math.random() * 1.0,
      zoom: 0.8 + Math.random() * 0.5, spinV: (Math.random() - 0.5) * 1.6,
      bgWash: Math.random() * 0.6, thick: 0.6 + Math.random() * 1.4,
      mirror: Math.random() < 0.35, shake: Math.random() < 0.5,
    }));
    const th = VIS_THEMES.filter((x) => x !== "CLOCK");
    setVisTheme(th[Math.floor(Math.random() * th.length)]);
  };

  const ensurePeaks = async (tr) => {
    if (!tr || tr.peaks || tr.decoding || !tr.file) return;
    tr.decoding = true;
    try {
      const ab = await tr.file.arrayBuffer();
      const buf = await nodes.current.ctx.decodeAudioData(ab);
      const ch = buf.getChannelData(0);
      const N = 180, step = Math.floor(ch.length / N), pk = [];
      for (let i = 0; i < N; i++) {
        let m = 0;
        for (let j = 0; j < step; j += 24) { const a = Math.abs(ch[i * step + j]); if (a > m) m = a; }
        pk.push(m);
      }
      const mx = Math.max(...pk, 0.01);
      tr.peaks = pk.map((p) => p / mx);
      force((x) => x + 1);
    } catch {} finally { tr.decoding = false; }
  };

  // ═══ TRANSPORT ═══
  const playAt = useCallback((plId, i) => {
    const pl = playlists.find((p) => p.id === plId);
    if (!pl || !pl.tracks[i]) return;
    ensureAudio();
    const el = audioRef.current;
    const doSwitch = () => {
      const tr = pl.tracks[i];
      el.src = tr.url;
      el.volume = volume;
      const useFx = tr.fxPin || null;
      if (useFx) { setFx({ ...useFx }); setActivePreset("PINNED"); }
      el.playbackRate = (useFx || fx).speed;
      try { el.preservesPitch = !(useFx || fx).vinyl; } catch {}
      el.play().then(() => setPlaying(true)).catch(() => {});
      setPlayPl(plId); setCurrent(i);
      setLoopA(null); setLoopB(null); setCues([null, null, null, null]); setNoteOpen(false);
      tr.plays = (tr.plays || 0) + 1;
      tr.lastPlayedAt = Date.now();
      setStats((s) => ({ ...s, plays: s.plays + 1 }));
      ensurePeaks(tr);
      const n = nodes.current;
      if (n && smooth) n.fader.gain.setTargetAtTime(1, n.ctx.currentTime, 0.12);
    };
    const n = nodes.current;
    if (smooth && n && playing) {
      n.fader.gain.setTargetAtTime(0, n.ctx.currentTime, 0.08);
      setTimeout(doSwitch, 240);
    } else doSwitch();
  }, [playlists, volume, fx, smooth, playing, ensureAudio]); // eslint-disable-line

  const addFiles = useCallback((fileList) => {
    const audioFiles = Array.from(fileList).filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name));
    if (!audioFiles.length) return;
    const targetId = viewingPlId || playPl;
    const items = audioFiles.map((f) => ({
      id: uid(), name: cleanName(f.name), url: URL.createObjectURL(f), file: f,
      plays: 0, fav: false, tags: [], note: "", addedAt: Date.now(), lastPlayedAt: 0,
    }));
    setPlaylists((prev) => {
      const next = prev.map((p) => (p.id === targetId ? { ...p, tracks: [...p.tracks, ...items] } : p));
      const pl = next.find((p) => p.id === targetId);
      if (current < 0) setTimeout(() => playAt(targetId, pl.tracks.length - items.length), 60);
      return next;
    });
  }, [viewingPlId, playPl, current, playAt]);

  const togglePlay = useCallback(() => {
    if (current < 0) { if (playingList.tracks.length) playAt(playPl, 0); return; }
    ensureAudio();
    const el = audioRef.current;
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  }, [current, playingList, playPl, playAt, ensureAudio]);

  const nextTrack = useCallback((auto = false) => {
    const list = playlists.find((p) => p.id === playPl);
    if (!list || !list.tracks.length) return;
    if (auto && repeatRef.current === "one") { playAt(playPl, current); return; }
    let n;
    if (shuffle && list.tracks.length > 1) { do { n = Math.floor(Math.random() * list.tracks.length); } while (n === current); }
    else {
      n = current + 1;
      if (n >= list.tracks.length) {
        if (repeatRef.current === "off" && auto) { setPlaying(false); return; }
        n = 0;
      }
    }
    playAt(playPl, n);
  }, [playlists, playPl, current, shuffle, playAt]);

  const prevTrack = useCallback(() => {
    const list = playlists.find((p) => p.id === playPl);
    if (!list || !list.tracks.length) return;
    if (audioRef.current && audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; return; }
    playAt(playPl, (current - 1 + list.tracks.length) % list.tracks.length);
  }, [playlists, playPl, current, playAt]);

  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onTime = () => {
      const { a, b } = loopRef.current;
      if (a !== null && b !== null && el.currentTime >= b) el.currentTime = a;
      setProgress(el.currentTime); setDuration(el.duration || 0);
    };
    const onEnd = () => nextTrack(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => { el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnd); };
  }, [nextTrack, current]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setStats((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
    return () => clearInterval(iv);
  }, [playing]);
  useEffect(() => {
    if (!sleepEnd) { setSleepLeft(""); return; }
    const iv = setInterval(() => {
      const left = sleepEnd - Date.now();
      if (left <= 0) { audioRef.current?.pause(); setPlaying(false); setSleepEnd(null); setSleepLeft(""); }
      else setSleepLeft(`${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepEnd]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
      if (e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowRight") nextTrack();
      if (e.key === "ArrowLeft") prevTrack();
      if (e.key === "Escape") { setVisPanel(false); setVisOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nextTrack, prevTrack]);

  // ═══ DJ TOOLS ═══
  const setCue = (i) => {
    setCues((prev) => {
      const next = [...prev];
      if (next[i] === null) next[i] = progress;
      else if (audioRef.current) { audioRef.current.currentTime = next[i]; setProgress(next[i]); }
      return next;
    });
  };
  const clearCue = (i) => setCues((prev) => { const n = [...prev]; n[i] = null; return n; });
  const stutterDown = (ms) => {
    const el = audioRef.current; if (!el || el.paused) return;
    const pos = el.currentTime;
    stutterIv.current = setInterval(() => { el.currentTime = pos; }, ms);
  };
  const stutterUp = () => { if (stutterIv.current) { clearInterval(stutterIv.current); stutterIv.current = null; } };
  const brake = () => {
    const el = audioRef.current; if (!el || el.paused || brakeAnim.current) return;
    brakeAnim.current = true;
    try { el.preservesPitch = false; } catch {}
    const start = performance.now(); const from = el.playbackRate;
    const anim = (now) => {
      const p = Math.min(1, (now - start) / 850);
      el.playbackRate = Math.max(0.07, from * (1 - p) * (1 - p));
      if (p < 1) requestAnimationFrame(anim);
      else { el.pause(); setPlaying(false); el.playbackRate = fx.speed; try { el.preservesPitch = !fx.vinyl; } catch {} brakeAnim.current = false; }
    };
    requestAnimationFrame(anim);
  };
  const launch = () => {
    const el = audioRef.current; if (!el) return;
    ensureAudio();
    brakeAnim.current = true;
    try { el.preservesPitch = false; } catch {}
    el.playbackRate = 0.07;
    el.play().then(() => setPlaying(true)).catch(() => {});
    const start = performance.now();
    const anim = (now) => {
      const p = Math.min(1, (now - start) / 850);
      el.playbackRate = Math.max(0.07, fx.speed * p * p);
      if (p < 1) requestAnimationFrame(anim);
      else { el.playbackRate = fx.speed; try { el.preservesPitch = !fx.vinyl; } catch {} brakeAnim.current = false; }
    };
    requestAnimationFrame(anim);
  };

  // ═══ RECORDER ═══
  const recTimeRef = useRef(0); recTimeRef.current = recTime;
  const startRec = () => {
    ensureAudio();
    const n = nodes.current; if (!n) return;
    let mime = "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    try {
      const rec = new MediaRecorder(n.streamDest.stream, mime ? { mimeType: mime } : undefined);
      recChunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recChunks.current, { type: mime || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setExports((ex) => [...ex, { id: uid(), url, name: `flux-take-${ex.length + 1}.${mime.includes("mp4") ? "m4a" : "webm"}`, secs: recTimeRef.current }]);
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecState("rec"); setRecTime(0);
    } catch { setRecState("idle"); }
  };
  useEffect(() => {
    if (recState !== "rec") return;
    const iv = setInterval(() => setRecTime((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [recState]);
  const stopRec = () => { recorderRef.current?.stop(); setRecState("idle"); };

  // ═══ PERSONAL ═══
  const toggleFav = (tr) => { tr.fav = !tr.fav; force((x) => x + 1); };
  const toggleTag = (tr, tag) => {
    if (!tr.tags) tr.tags = [];
    tr.tags = tr.tags.includes(tag) ? tr.tags.filter((t) => t !== tag) : [...tr.tags, tag];
    force((x) => x + 1);
  };
  const togglePin = () => {
    if (!track) return;
    if (track.fxPin) delete track.fxPin;
    else track.fxPin = { ...fx };
    force((x) => x + 1);
  };
  const playNext = (tr) => {
    setPlaylists((prev) => prev.map((p) => {
      if (p.id !== playPl) return p;
      const tracks = [...p.tracks];
      tracks.splice(Math.max(0, current + 1), 0, { ...tr, id: uid() });
      return { ...p, tracks };
    }));
    setRowMenu(null);
  };

  // ═══ RENDER LOOP ═══
  const trackRef = useRef(null); trackRef.current = track;
  const progRef = useRef(0); progRef.current = duration ? progress / duration : 0;
  const durRef = useRef(0); durRef.current = duration;

  useEffect(() => {
    const freq = new Uint8Array(512);
    const wave = new Uint8Array(1024);
    let t = 0;
    // sphere points for ORB
    const LAT = 12, LON = 24, spherePts = [];
    for (let la = 0; la <= LAT; la++) for (let lo = 0; lo < LON; lo++) {
      const phi = (la / LAT) * Math.PI, th2 = (lo / LON) * Math.PI * 2;
      spherePts.push({ x: Math.sin(phi) * Math.cos(th2), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(th2), la, lo });
    }
    const sizeCanvas = (cv) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = cv.clientWidth, chh = cv.clientHeight;
      if (cv.width !== cw * dpr || cv.height !== chh * dpr) {
        cv.width = cw * dpr; cv.height = chh * dpr;
        cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return [cw, chh];
    };

    const draw = () => {
      t++;
      const n = nodes.current;
      const L = live.current;
      const cfg = L.cfg || {};
      let bass = 0.08 + Math.sin(t * 0.01) * 0.03, mid = bass * 0.8, treb = bass * 0.5, liveAudio = false, rms = 0, beat = false;
      if (n && L.playing) {
        n.analyser.getByteFrequencyData(freq);
        n.analyser.getByteTimeDomainData(wave);
        bass = 0; for (let i = 0; i < 16; i++) bass += freq[i]; bass /= 4080;
        mid = 0; for (let i = 16; i < 128; i++) mid += freq[i]; mid /= 28560;
        treb = 0; for (let i = 128; i < 380; i++) treb += freq[i]; treb /= 64260;
        for (let i = 0; i < 1024; i += 8) { const d = (wave[i] - 128) / 128; rms += d * d; }
        rms = Math.sqrt(rms / 128);
        liveAudio = true;
        if (L.spin) n.panner.pan.value = Math.sin(t * 0.016 * L.spinRate) * 0.95;
        L.beatAvg = L.beatAvg * 0.95 + bass * 0.05;
        if (L.beatCool > 0) L.beatCool--;
        if (bass > Math.max(0.2, L.beatAvg * 1.35) && L.beatCool === 0) {
          L.beatCool = 12; beat = true;
          const now = performance.now();
          L.beats.push(now);
          if (L.beats.length > 16) L.beats.shift();
          const ivs = [];
          for (let i = 1; i < L.beats.length; i++) { const d = L.beats[i] - L.beats[i - 1]; if (d > 250 && d < 1200) ivs.push(d); }
          if (ivs.length >= 4) { ivs.sort((a, b) => a - b); L.bpm = Math.round(60000 / ivs[Math.floor(ivs.length / 2)]); }
        }
      } else {
        for (let i = 0; i < wave.length; i++) wave[i] = 128 + Math.sin(t * 0.02 + i * 0.05) * 5;
      }

      if (bpmRef.current) bpmRef.current.textContent = L.bpm ? `${L.bpm}` : "––";
      if (levelRef.current) levelRef.current.style.width = `${Math.min(100, rms * 240)}%`;

      const bg = bgRef.current;
      if (bg) {
        const [w, h] = sizeCanvas(bg);
        const c = bg.getContext("2d");
        c.fillStyle = "rgba(8,9,13,0.3)"; c.fillRect(0, 0, w, h);
        const g = c.createRadialGradient(w / 2, h * 0.25, 0, w / 2, h * 0.25, h * (0.5 + bass * 0.3));
        g.addColorStop(0, `rgba(83,233,255,${0.04 + bass * 0.10})`);
        g.addColorStop(0.6, `rgba(255,78,205,${0.02 + bass * 0.05})`);
        g.addColorStop(1, "transparent");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        // edge spectrum meters — fill the flanks on every tab
        const SB = 18;
        for (let i = 0; i < SB; i++) {
          const v = liveAudio ? freq[i * 9] / 255 : 0.08 + 0.07 * Math.sin(t * 0.02 + i * 0.6);
          const bh2 = h / SB;
          const bw2 = 3 + v * 30;
          c.fillStyle = `rgba(83,233,255,${0.06 + v * 0.3})`;
          c.fillRect(0, i * bh2 + 2, bw2, bh2 - 4);
          c.fillStyle = `rgba(255,78,205,${0.06 + v * 0.3})`;
          c.fillRect(w - bw2, i * bh2 + 2, bw2, bh2 - 4);
        }
      }

      if (discRef.current) {
        if (L.playing) L.rot += 0.7 * L.speed;
        discRef.current.style.transform = `rotate(${L.rot}deg) scale(${1 + bass * 0.05})`;
        discRef.current.style.boxShadow = `0 0 ${30 + bass * 70}px rgba(83,233,255,${0.15 + bass * 0.4})`;
      }

      const wv = waveRef.current;
      const tr = trackRef.current;
      if (wv) {
        const [w, h] = sizeCanvas(wv);
        const c = wv.getContext("2d");
        c.clearRect(0, 0, w, h);
        const pk = tr && tr.peaks;
        const N = pk ? pk.length : 90;
        const bw = w / N;
        const prog = progRef.current;
        for (let i = 0; i < N; i++) {
          const v = pk ? pk[i] : 0.25 + 0.2 * Math.sin(i * 0.4 + t * 0.03);
          const bh = Math.max(2, v * h * 0.92);
          c.fillStyle = i / N <= prog ? CYAN : "rgba(255,255,255,0.16)";
          c.fillRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1.5), bh);
        }
        const { a, b } = loopRef.current;
        const dur = durRef.current;
        if (a !== null && dur > 0) {
          c.fillStyle = "rgba(255,78,205,0.9)";
          c.fillRect((a / dur) * w - 1, 0, 2, h);
          if (b !== null) {
            c.fillRect((b / dur) * w - 1, 0, 2, h);
            c.fillStyle = "rgba(255,78,205,0.12)";
            c.fillRect((a / dur) * w, 0, ((b - a) / dur) * w, h);
          }
        }
      }

      // ═══ VISUAL ENGINE v2 ═══
      const vc = visRef.current;
      if (vc && L.visOpen) {
        const [w, h] = sizeCanvas(vc);
        const c = vc.getContext("2d");
        const cx = w / 2, cy = h / 2, R = Math.min(w, h);

        const pal = PALETTES.find((p) => p.id === cfg.palette) || PALETTES[0];
        const h1 = pal.h ? pal.h[0] : cfg.h1;
        const h2 = pal.h ? pal.h[1] : cfg.h2;
        const sat = pal.s;
        const C1 = (a = 1, l = 62) => `hsla(${h1}, ${sat}%, ${l}%, ${a})`;
        const C2 = (a = 1, l = 62) => `hsla(${h2}, ${sat}%, ${l}%, ${a})`;
        const CMix = (f, a = 1, l = 62) => `hsla(${h1 + (h2 - h1) * f}, ${sat}%, ${l}%, ${a})`;
        const GLOW = cfg.glow;
        const TK = cfg.thick;
        const glow = (blur, color) => { c.shadowBlur = blur * GLOW * 1.6; c.shadowColor = color; };
        const noGlow = () => { c.shadowBlur = 0; };

        // intensity-scaled bands + engine time
        const I = cfg.intensity;
        const bassV = Math.min(1, bass * I), midV = Math.min(1, mid * I), trebV = Math.min(1, treb * I);
        L.vt += cfg.speed;
        const vt = L.vt;

        if (beat && cfg.flash) L.flashVal = 0.28;
        if (beat && cfg.shake) L.shakeVal = 7;
        if (L.flashVal > 0) L.flashVal *= 0.86;
        if (L.shakeVal > 0) L.shakeVal *= 0.8;
        if (cfg.autoCycle && L.playing) {
          L.cycleT++;
          if (L.cycleT > 60 * 16) {
            L.cycleT = 0;
            const cyc = VIS_THEMES.filter((th) => th !== "CLOCK");
            const idx = cyc.indexOf(L.visTheme);
            setVisThemeRef.current(cyc[(idx + 1) % cyc.length]);
          }
        }

        // trail fade + bg wash
        const fade = 0.06 + (1 - cfg.trail) * 0.34;
        c.fillStyle = `rgba(5,6,10,${fade})`;
        c.fillRect(0, 0, w, h);
        if (cfg.bgWash > 0.01) {
          const wg = c.createLinearGradient(0, 0, w, h);
          wg.addColorStop(0, C1(cfg.bgWash * (0.05 + bassV * 0.05), 40));
          wg.addColorStop(1, C2(cfg.bgWash * (0.05 + bassV * 0.05), 40));
          c.fillStyle = wg; c.fillRect(0, 0, w, h);
        }

        const TH = L.visTheme;
        c.save();
        if (L.shakeVal > 0.3) c.translate((Math.random() - 0.5) * L.shakeVal, (Math.random() - 0.5) * L.shakeVal);
        c.translate(cx, cy);
        if (TH !== "CLOCK") c.rotate(cfg.spinV * vt * 0.0018);
        c.scale(cfg.zoom, cfg.zoom);
        c.translate(-cx, -cy);
        c.globalCompositeOperation = "lighter";

        if (TH === "RING") {
          const base = R * (0.2 + bassV * 0.07);
          for (let pass = 0; pass < 2; pass++) {
            c.beginPath();
            const N = 160;
            for (let i = 0; i <= N; i++) {
              const ang = (i / N) * Math.PI * 2;
              const wvv = (wave[Math.floor((i / N) * 1023)] - 128) / 128;
              const rad = base + wvv * base * (0.4 + bassV * 0.5) * I;
              i === 0 ? c.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad) : c.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
            }
            c.closePath();
            c.strokeStyle = pass === 0 ? C1(0.95) : C2(0.5);
            c.lineWidth = (pass === 0 ? 2.5 : 7 + bassV * 12) * TK;
            glow(pass === 0 ? 16 : 36, C1());
            c.stroke();
          }
          noGlow();
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, base);
          g.addColorStop(0, C1(0.2 + bassV * 0.5, 70)); g.addColorStop(1, "transparent");
          c.fillStyle = g; c.beginPath(); c.arc(cx, cy, base, 0, Math.PI * 2); c.fill();
        }

        if (TH === "KALEIDO") {
          const SEG = 10, armLen = R * 0.52;
          for (let s = 0; s < SEG; s++) {
            c.save(); c.translate(cx, cy);
            c.rotate((s / SEG) * Math.PI * 2 + vt * 0.003);
            if (s % 2) c.scale(1, -1);
            c.beginPath();
            const N = 42;
            for (let i = 0; i <= N; i++) {
              const p = i / N;
              const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + i);
              const x = p * armLen;
              const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV);
              i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
            }
            c.strokeStyle = CMix(s / SEG, 0.75);
            c.lineWidth = (1.6 + bassV * 3.5) * TK;
            glow(14, CMix(s / SEG));
            c.stroke();
            for (let i = 4; i <= 40; i += 9) {
              const p = i / 42;
              const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.2;
              const x = p * armLen;
              const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV);
              c.fillStyle = CMix(p, 0.85, 74);
              c.beginPath(); c.arc(x, y, (1.5 + fv * 5 + bassV * 3) * TK, 0, Math.PI * 2); c.fill();
            }
            c.restore();
          }
          noGlow();
        }

        if (TH === "HELIX") {
          const amp = h * (0.12 + bassV * 0.12);
          const N = 60;
          for (let strand = 0; strand < 2; strand++) {
            c.beginPath();
            for (let i = 0; i <= N; i++) {
              const x = (i / N) * (w + 40) - 20;
              const ph = (i / N) * Math.PI * 4 + vt * 0.03 + strand * Math.PI;
              const y = cy + Math.sin(ph) * amp;
              i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
            }
            c.strokeStyle = strand ? C2(0.8) : C1(0.8);
            c.lineWidth = (2 + bassV * 3) * TK;
            glow(16, strand ? C2() : C1());
            c.stroke();
          }
          for (let i = 0; i <= N; i += 3) {
            const x = (i / N) * (w + 40) - 20;
            const ph = (i / N) * Math.PI * 4 + vt * 0.03;
            const y1 = cy + Math.sin(ph) * amp;
            const y2 = cy + Math.sin(ph + Math.PI) * amp;
            const fv = liveAudio ? freq[Math.floor((i / N) * 180)] / 255 : 0.2;
            c.strokeStyle = CMix(i / N, 0.22 + fv * 0.5);
            c.lineWidth = 1 * TK;
            c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y2); c.stroke();
            c.fillStyle = C1(0.9, 72);
            c.beginPath(); c.arc(x, y1, (2 + fv * 6 * I) * TK, 0, Math.PI * 2); c.fill();
            c.fillStyle = C2(0.9, 72);
            c.beginPath(); c.arc(x, y2, (2 + fv * 6 * I) * TK, 0, Math.PI * 2); c.fill();
          }
          noGlow();
        }

        if (TH === "WAVES") {
          if (t % 3 === 0) {
            const row = [];
            for (let i = 0; i < 48; i++) row.push(liveAudio ? freq[i * 4] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.4));
            L.specHist.unshift(row);
            if (L.specHist.length > 22) L.specHist.pop();
          }
          const horizon = cy - h * 0.12;
          for (let r = L.specHist.length - 1; r >= 0; r--) {
            const row = L.specHist[r];
            const depth = r / 22;
            const y0 = horizon + Math.pow(1 - depth, 2.2) * (h * 0.78);
            const spread = 0.25 + (1 - depth) * 0.75;
            c.beginPath();
            for (let i = 0; i < row.length; i++) {
              const x = cx + ((i / (row.length - 1)) - 0.5) * w * spread * 1.9;
              const y = y0 - row[i] * h * 0.24 * (1 - depth) * (0.6 + bassV * 1.2) * I;
              i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
            }
            c.strokeStyle = CMix(1 - depth, 0.15 + (1 - depth) * 0.8);
            c.lineWidth = (1 + (1 - depth) * 2.2) * TK;
            glow(10, CMix(1 - depth));
            c.stroke();
          }
          noGlow();
        }

        if (TH === "LASERS") {
          const beams = 14;
          for (let i = 0; i < beams; i++) {
            const fv = liveAudio ? freq[Math.floor((i / beams) * 200)] / 255 : 0.2;
            const ang = vt * 0.004 * (i % 2 ? 1 : -1) + (i / beams) * Math.PI * 2;
            const len = R * (0.5 + fv * 0.6 * I + bassV * 0.3);
            c.strokeStyle = CMix(i / beams, 0.25 + fv * 0.65);
            c.lineWidth = (1.5 + fv * 4 + bassV * 2) * TK;
            glow(20, CMix(i / beams));
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
            c.stroke();
          }
          noGlow();
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.08 + bassV * 0.08));
          g.addColorStop(0, `rgba(255,255,255,${0.5 + bassV * 0.5})`);
          g.addColorStop(0.4, C1(0.4));
          g.addColorStop(1, "transparent");
          c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.2, 0, Math.PI * 2); c.fill();
        }

        if (TH === "GRID") {
          const horizon = cy * 1.0;
          const sr = R * (0.14 + bassV * 0.08);
          const sg = c.createRadialGradient(cx, horizon - sr * 0.5, 0, cx, horizon - sr * 0.5, sr * 2);
          sg.addColorStop(0, C1(0.5 + bassV * 0.4, 68));
          sg.addColorStop(1, "transparent");
          c.fillStyle = sg; c.beginPath(); c.arc(cx, horizon - sr * 0.5, sr * 2, 0, Math.PI * 2); c.fill();
          c.lineWidth = 1.2 * TK;
          for (let i = -12; i <= 12; i++) {
            c.beginPath();
            c.moveTo(cx + i * 24, horizon);
            c.lineTo(cx + i * w * 0.12, h);
            c.strokeStyle = C2(0.3 + midV * 0.4);
            c.stroke();
          }
          const scroll = (vt * (1.5 + bassV * 12)) % 60;
          for (let i = 0; i < 14; i++) {
            const p = (i * 60 + scroll) / (14 * 60);
            const y = horizon + Math.pow(p, 2.1) * (h - horizon);
            c.beginPath(); c.moveTo(0, y); c.lineTo(w, y);
            c.strokeStyle = C2(0.2 + p * 0.6);
            c.lineWidth = (1 + p * 2.2 + bassV * 2) * TK;
            c.stroke();
          }
          const bars = 40;
          for (let i = 0; i < bars; i++) {
            const fv = liveAudio ? freq[i * 5] / 255 : 0.1 + 0.08 * Math.sin(vt * 0.03 + i * 0.5);
            const bh = fv * h * 0.26 * I;
            const bw2 = w / bars;
            c.fillStyle = CMix(i / bars, 0.75);
            c.fillRect(i * bw2 + 1, horizon - bh, bw2 - 2, bh);
          }
        }

        if (TH === "ORB") {
          const rad = R * (0.24 + bassV * 0.07);
          const rotY = vt * 0.008, rotX = Math.sin(vt * 0.004) * 0.5 + 0.35;
          c.globalCompositeOperation = "lighter";
          const proj = spherePts.map((p) => {
            let x = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
            let z = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
            let y = p.y * Math.cos(rotX) - z * Math.sin(rotX);
            z = p.y * Math.sin(rotX) + z * Math.cos(rotX);
            const wob = 1 + (liveAudio ? (freq[(p.la * 24 + p.lo) % 200] / 255) * bassV * 0.5 : 0);
            const persp = 1.6 / (1.6 - z * 0.5);
            return { sx: cx + x * rad * persp * wob, sy: cy + y * rad * persp * wob, z, lo: p.lo };
          });
          for (let lo = 0; lo < LON; lo += 2) {
            c.beginPath();
            for (let la = 0; la <= LAT; la++) {
              const p = proj[la * LON + lo];
              la === 0 ? c.moveTo(p.sx, p.sy) : c.lineTo(p.sx, p.sy);
            }
            c.strokeStyle = CMix(lo / LON, 0.35);
            c.lineWidth = 1 * TK;
            c.stroke();
          }
          for (const p of proj) {
            const a = (p.z + 1) / 2;
            c.fillStyle = CMix(p.lo / LON, 0.15 + a * 0.75, 74);
            c.beginPath(); c.arc(p.sx, p.sy, (1 + a * (1.6 + bassV * 3)) * TK, 0, Math.PI * 2); c.fill();
          }
        }

        if (TH === "RIPPLES") {
          if (beat) L.ripples.push({ r: R * 0.05, a: 0.9 });
          if (!liveAudio && t % 50 === 0) L.ripples.push({ r: R * 0.05, a: 0.7 });
          for (let i = L.ripples.length - 1; i >= 0; i--) {
            const rp = L.ripples[i];
            rp.r += R * 0.012 * cfg.speed; rp.a *= 0.96;
            if (rp.a < 0.02) { L.ripples.splice(i, 1); continue; }
            c.beginPath(); c.arc(cx, cy, rp.r, 0, Math.PI * 2);
            c.strokeStyle = C1(rp.a);
            c.lineWidth = (2 + rp.a * 3) * TK;
            glow(14, C1());
            c.stroke();
          }
          for (let ring = 0; ring < 6; ring++) {
            const fv = liveAudio ? freq[ring * 30 + 5] / 255 : 0.15;
            const rr = R * (0.08 + ring * 0.06) * (1 + fv * 0.35 * I);
            c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2);
            c.strokeStyle = CMix(ring / 6, 0.25 + fv * 0.6);
            c.lineWidth = (1.2 + fv * 4) * TK;
            c.stroke();
          }
          noGlow();
        }

        if (TH === "SPIRAL") {
          const dots = 220;
          for (let i = 0; i < dots; i++) {
            const p = i / dots;
            const ang = p * Math.PI * 10 + vt * 0.012;
            const rr = p * R * 0.55 * (1 + bassV * 0.18);
            const fv = liveAudio ? freq[Math.floor(p * 200)] / 255 : 0.18;
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.85;
            c.fillStyle = CMix(p, 0.3 + fv * 0.65, 70);
            glow(10, CMix(p));
            c.beginPath(); c.arc(x, y, (1 + fv * 6 * I + bassV * 2) * TK, 0, Math.PI * 2); c.fill();
          }
          noGlow();
        }

        if (TH === "FIREFLIES") {
          if (!L.flies.length) L.flies = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, ph: Math.random() * Math.PI * 2 }));
          for (const f of L.flies) {
            f.vx += (Math.random() - 0.5) * 0.0006 + (0.5 - f.x) * bassV * 0.0022;
            f.vy += (Math.random() - 0.5) * 0.0006 + (0.5 - f.y) * bassV * 0.0022;
            f.vx *= 0.97; f.vy *= 0.97;
            f.x += f.vx * cfg.speed; f.y += f.vy * cfg.speed;
            if (f.x < 0 || f.x > 1) f.vx *= -1;
            if (f.y < 0 || f.y > 1) f.vy *= -1;
            const blink = 0.35 + Math.abs(Math.sin(vt * 0.03 + f.ph)) * 0.65;
            const sz = (1.5 + trebV * 4 + bassV * 2.5) * blink * TK;
            c.fillStyle = CMix((f.ph % 6.28) / 6.28, blink * (0.5 + midV * 0.5), 72);
            glow(16, C1());
            c.beginPath(); c.arc(f.x * w, f.y * h, sz, 0, Math.PI * 2); c.fill();
          }
          noGlow();
        }

        if (TH === "CITY") {
          const N = 26;
          if (!L.cityH.length) L.cityH = new Array(N).fill(0.1);
          const baseY = h * 0.8;
          const bw2 = w / N;
          for (let i = 0; i < N; i++) {
            const fv = liveAudio ? freq[i * 7] / 255 : 0.12 + 0.08 * Math.sin(vt * 0.02 + i);
            L.cityH[i] = Math.max(L.cityH[i] * 0.93, fv * I);
            const bh = L.cityH[i] * h * 0.55;
            c.fillStyle = CMix(i / N, 0.55, 45);
            c.fillRect(i * bw2 + 2, baseY - bh, bw2 - 4, bh);
            // windows
            c.fillStyle = C1(0.8, 78);
            for (let wy = baseY - bh + 6; wy < baseY - 4; wy += 10) {
              for (let wx = i * bw2 + 5; wx < (i + 1) * bw2 - 5; wx += 8) {
                if ((wx * wy) % 3 < 1.4) c.fillRect(wx, wy, 2.4, 3.2);
              }
            }
            // reflection
            c.fillStyle = CMix(i / N, 0.14, 45);
            c.fillRect(i * bw2 + 2, baseY + 2, bw2 - 4, bh * 0.35);
          }
          c.fillStyle = C2(0.8);
          c.fillRect(0, baseY, w, 2 * TK);
        }

        if (TH === "VORTEX") {
          if (!L.vort.length) L.vort = Array.from({ length: 160 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), sp: 0.5 + Math.random() }));
          for (const p of L.vort) {
            p.r -= (0.0012 + bassV * 0.004) * p.sp * cfg.speed;
            p.a += (0.012 + (1 - p.r) * 0.05) * cfg.speed;
            if (p.r <= 0.03) { p.r = 1; p.a = Math.random() * Math.PI * 2; }
            const x = cx + Math.cos(p.a) * p.r * R * 0.62;
            const y = cy + Math.sin(p.a) * p.r * R * 0.45;
            const sz = ((1 - p.r) * 3.4 + bassV * 3) * TK;
            c.fillStyle = CMix(1 - p.r, 0.25 + (1 - p.r) * 0.65, 70);
            c.beginPath(); c.arc(x, y, sz, 0, Math.PI * 2); c.fill();
          }
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.06 + bassV * 0.05));
          g.addColorStop(0, `rgba(255,255,255,${0.6 + bassV * 0.4})`);
          g.addColorStop(0.5, C2(0.5));
          g.addColorStop(1, "transparent");
          c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.15, 0, Math.PI * 2); c.fill();
        }

        if (TH === "SCOPE") {
          c.beginPath();
          const SC = R * 0.4 * I;
          for (let i = 0; i < 1024; i += 4) {
            const px = cx + ((wave[i] - 128) / 128) * SC;
            const py = cy + ((wave[(i + 300) % 1024] - 128) / 128) * SC;
            i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
          }
          c.strokeStyle = C1(0.8);
          c.lineWidth = 1.6 * TK;
          glow(18, C1());
          c.stroke();
          c.beginPath();
          for (let i = 0; i < 1024; i += 4) {
            const px = cx + ((wave[(i + 150) % 1024] - 128) / 128) * SC * 0.7;
            const py = cy + ((wave[(i + 500) % 1024] - 128) / 128) * SC * 0.7;
            i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
          }
          c.strokeStyle = C2(0.55);
          c.lineWidth = 1.2 * TK;
          glow(14, C2());
          c.stroke();
          noGlow();
        }

        if (TH === "AURORA") {
          for (let k = 0; k < 4; k++) {
            const band = liveAudio ? freq[20 + k * 40] / 255 : 0.15;
            for (let x = 0; x <= w; x += 12) {
              const yTop = h * 0.18 + Math.sin(x * 0.008 + vt * 0.016 + k * 1.7) * h * 0.09
                + Math.sin(x * 0.003 - vt * 0.01 + k) * h * 0.05;
              const len = h * (0.16 + band * 0.4 * I + bassV * 0.1);
              const g = c.createLinearGradient(0, yTop, 0, yTop + len);
              g.addColorStop(0, CMix(k / 4, 0.02));
              g.addColorStop(0.4, CMix(k / 4, 0.16 + band * 0.3, 65));
              g.addColorStop(1, "transparent");
              c.fillStyle = g;
              c.fillRect(x, yTop, 9, len);
            }
          }
        }

        if (TH === "DOTGRID") {
          const cols = 18, rows = 11;
          const gw = w / cols, gh = h / rows;
          for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
              const bin = Math.floor(((gx + gy * cols) / (cols * rows)) * 200);
              const fv = liveAudio ? freq[bin] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + gx + gy);
              const pulse = fv * I + bassV * 0.25;
              const rr = Math.min(gw, gh) * 0.42 * Math.min(1, pulse * 1.4);
              if (rr < 0.6) continue;
              c.fillStyle = CMix(gx / cols, 0.25 + pulse * 0.7, 65);
              c.beginPath();
              c.arc(gx * gw + gw / 2, gy * gh + gh / 2, rr, 0, Math.PI * 2);
              c.fill();
            }
          }
        }

        if (TH === "BARS") {
          const N = 64, bw2 = w / N;
          for (let i = 0; i < N; i++) {
            const v = (liveAudio ? freq[Math.floor((i / N) * 200)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.5)) * I;
            const bh = Math.min(0.48, v * 0.42) * h;
            const grad = c.createLinearGradient(0, cy - bh, 0, cy + bh);
            grad.addColorStop(0, C2(0.9));
            grad.addColorStop(0.5, C1(0.95));
            grad.addColorStop(1, C2(0.9));
            c.fillStyle = grad;
            glow(12, C1());
            c.fillRect(i * bw2 + 1.5, cy - bh, bw2 - 3, bh * 2);
          }
          noGlow();
        }

        if (TH === "NEBULA") {
          for (let i = 0; i < 5; i++) {
            const ang = vt * 0.004 + (i / 5) * Math.PI * 2;
            const RR = R * (0.18 + midV * 0.3);
            const bx = cx + Math.cos(ang) * RR * (1 + Math.sin(vt * 0.006 + i) * 0.4);
            const by = cy + Math.sin(ang * 1.3) * RR;
            const rad = R * (0.15 + bassV * 0.22 + i * 0.02);
            const g = c.createRadialGradient(bx, by, 0, bx, by, rad);
            g.addColorStop(0, i % 2 ? C2(0.14 + bassV * 0.2) : C1(0.14 + bassV * 0.2));
            g.addColorStop(1, "transparent");
            c.fillStyle = g; c.beginPath(); c.arc(bx, by, rad, 0, Math.PI * 2); c.fill();
          }
        }

        if (TH === "TUNNEL") {
          if (t % 7 === 0) L.tunnel.push({ z: 1, rot: vt * 0.01 });
          for (let i = L.tunnel.length - 1; i >= 0; i--) {
            const r = L.tunnel[i];
            r.z -= (0.006 + bassV * 0.028) * cfg.speed;
            if (r.z <= 0.03) { L.tunnel.splice(i, 1); continue; }
            const rad = (R * 0.75) / r.z * 0.14;
            c.save(); c.translate(cx, cy); c.rotate(r.rot + vt * 0.002);
            c.beginPath();
            for (let s = 0; s <= 6; s++) {
              const ang = (s / 6) * Math.PI * 2;
              const rr = rad * (1 + (s % 2) * bassV * 0.25);
              s === 0 ? c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            }
            c.strokeStyle = i % 2 ? C1((1 - r.z) * 0.85) : C2((1 - r.z) * 0.85);
            c.lineWidth = (1.5 + (1 - r.z) * 3.5 + bassV * 3) * TK;
            glow(18, C1());
            c.stroke(); c.restore();
          }
          noGlow();
        }

        if (TH === "STARFIELD") {
          if (!L.stars.length) L.stars = Array.from({ length: 240 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
          const speed = (0.002 + bassV * 0.03) * cfg.speed;
          for (const s of L.stars) {
            s.z -= speed;
            if (s.z <= 0.02) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; }
            const sx = cx + (s.x / s.z) * cx * 0.9;
            const sy = cy + (s.y / s.z) * cy * 0.9;
            const size = (1 - s.z) * (2.2 + bassV * 4) * TK;
            c.fillStyle = (s.x + s.y) % 0.2 > 0.1 ? C2((1 - s.z) * 0.9, 72) : C1((1 - s.z) * 0.9, 72);
            c.beginPath(); c.arc(sx, sy, size, 0, Math.PI * 2); c.fill();
          }
        }

        if (TH === "CLOCK") {
          for (let i = 0; i < 3; i++) {
            const ang = vt * 0.002 + i * 2.1;
            const bx = cx + Math.cos(ang) * w * 0.2;
            const by = cy + Math.sin(ang * 0.8) * h * 0.18;
            const rad = R * (0.3 + bassV * 0.15);
            const g = c.createRadialGradient(bx, by, 0, bx, by, rad);
            g.addColorStop(0, i % 2 ? C2(0.05 + bassV * 0.06) : C1(0.05 + bassV * 0.06));
            g.addColorStop(1, "transparent");
            c.fillStyle = g; c.beginPath(); c.arc(bx, by, rad, 0, Math.PI * 2); c.fill();
          }
          c.globalCompositeOperation = "source-over";
          const d = new Date();
          const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
          c.fillStyle = "rgba(255,255,255,0.92)";
          c.font = `700 ${Math.floor(R * 0.22)}px 'Space Grotesk', sans-serif`;
          c.textAlign = "center"; c.textBaseline = "middle";
          glow(30 + bassV * 40, C1());
          c.fillText(`${hh}:${mm}`, cx, cy - R * 0.02);
          noGlow();
          c.font = `400 ${Math.floor(R * 0.035)}px 'JetBrains Mono', monospace`;
          c.fillStyle = "rgba(255,255,255,0.5)";
          const trk = trackRef.current;
          c.fillText(trk ? trk.name.slice(0, 40) : "", cx, cy + R * 0.13);
          c.globalCompositeOperation = "lighter";
        }

        // particle overlay w/ styles
        const targetCount = Math.floor(cfg.particles * 150);
        while (L.vparts.length < targetCount) L.vparts.push({ x: Math.random(), y: Math.random(), sp: 0.0004 + Math.random() * 0.0012, sz: 0.8 + Math.random() * 2.4, ph: Math.random() * Math.PI * 2 });
        if (L.vparts.length > targetCount) L.vparts.length = targetCount;
        for (const p of L.vparts) {
          const st = cfg.pStyle;
          if (st === "RISE") { p.y -= p.sp * (1 + bassV * 8) * cfg.speed; p.x += Math.sin(vt * 0.01 + p.ph) * 0.0006; }
          if (st === "SNOW") { p.y += p.sp * (0.8 + midV * 3) * cfg.speed; p.x += Math.sin(vt * 0.02 + p.ph) * 0.0012; }
          if (st === "DUST") { p.x += Math.sin(vt * 0.008 + p.ph) * 0.0007; p.y += Math.cos(vt * 0.006 + p.ph * 2) * 0.0005; }
          if (st === "EMBERS") { p.y -= p.sp * (2.2 + bassV * 12) * cfg.speed; p.x += Math.sin(vt * 0.03 + p.ph) * 0.0014; }
          if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
          if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
          if (p.x < -0.02) p.x = 1.02; if (p.x > 1.02) p.x = -0.02;
          const tw = st === "EMBERS" ? 0.3 + Math.abs(Math.sin(vt * 0.09 + p.ph)) * 0.7 : 0.4 + Math.sin(vt * 0.05 + p.ph) * 0.3;
          c.fillStyle = CMix((p.ph % 6.28) / 6.28, (0.25 + bassV * 0.5) * tw, st === "EMBERS" ? 62 : 75);
          c.beginPath(); c.arc(p.x * w, p.y * h, p.sz * (1 + bassV * 1.6) * (st === "SNOW" ? 1.3 : 1) * TK, 0, Math.PI * 2); c.fill();
        }

        c.restore();

        // mirror
        if (cfg.mirror) {
          c.save();
          c.globalCompositeOperation = "source-over";
          c.translate(w, 0); c.scale(-1, 1);
          c.drawImage(vc, 0, 0, vc.width / 2, vc.height, 0, 0, w / 2, h);
          c.restore();
        }

        // beat flash
        if (L.flashVal > 0.01) {
          c.fillStyle = C1(L.flashVal * 0.3, 80);
          c.fillRect(0, 0, w, h);
        }

        // vignette
        const vg = c.createRadialGradient(cx, cy, R * 0.35, cx, cy, Math.max(w, h) * 0.75);
        vg.addColorStop(0, "transparent");
        vg.addColorStop(1, "rgba(0,0,0,0.5)");
        c.fillStyle = vg; c.fillRect(0, 0, w, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line

  const waveSeek = (e) => {
    const wv = waveRef.current; if (!wv || !duration) return;
    const rect = wv.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const tt = Math.max(0, Math.min(1, x / rect.width)) * duration;
    if (audioRef.current) audioRef.current.currentTime = tt;
    setProgress(tt);
  };

  // ═══ LIBRARY OPS ═══
  const newPlaylist = () => {
    const id = uid();
    setPlaylists((p) => [...p, { id, name: `PLAYLIST ${p.length}`, tracks: [] }]);
    setViewMode({ type: "pl", id });
  };
  const renamePl = () => {
    if (!renameVal.trim() || !viewingPlId) { setRenaming(false); return; }
    setPlaylists((prev) => prev.map((p) => (p.id === viewingPlId ? { ...p, name: renameVal.trim().toUpperCase() } : p)));
    setRenaming(false);
  };
  const deletePl = () => {
    if (playlists.length <= 1 || !viewingPlId) return;
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== viewingPlId);
      if (playPl === viewingPlId) { audioRef.current?.pause(); setPlaying(false); setCurrent(-1); setPlayPl(next[0].id); }
      setViewMode({ type: "pl", id: next[0].id });
      return next;
    });
    setConfirmDel(false);
  };
  const removeTrack = (tid, plId) => {
    setPlaylists((prev) => prev.map((p) => (p.id === plId ? { ...p, tracks: p.tracks.filter((tr) => tr.id !== tid) } : p)));
    setRowMenu(null);
  };
  const moveTrack = (plId, i, dir) => {
    setPlaylists((prev) => prev.map((p) => {
      if (p.id !== plId) return p;
      const tr = [...p.tracks];
      const j = i + dir;
      if (j < 0 || j >= tr.length) return p;
      [tr[i], tr[j]] = [tr[j], tr[i]];
      if (playPl === plId) {
        if (current === i) setCurrent(j);
        else if (current === j) setCurrent(i);
      }
      return { ...p, tracks: tr };
    }));
  };
  const copyTrack = (tr, targetId) => {
    setPlaylists((prev) => prev.map((p) => (p.id === targetId ? { ...p, tracks: [...p.tracks, { ...tr, id: uid() }] } : p)));
    setRowMenu(null);
  };

  const getView = () => {
    let entries;
    if (viewMode.type === "pl") {
      const pl = playlists.find((p) => p.id === viewMode.id) || playlists[0];
      entries = pl.tracks.map((tr, idx) => ({ tr, plId: pl.id, idx }));
    } else {
      entries = [];
      for (const p of playlists) p.tracks.forEach((tr, idx) => {
        if (viewMode.type === "fav" && tr.fav) entries.push({ tr, plId: p.id, idx });
        if (viewMode.type === "recent" && tr.lastPlayedAt) entries.push({ tr, plId: p.id, idx });
        if (viewMode.type === "tag" && tr.tags?.includes(viewMode.tag)) entries.push({ tr, plId: p.id, idx });
      });
      if (viewMode.type === "recent") entries.sort((a, b) => b.tr.lastPlayedAt - a.tr.lastPlayedAt);
    }
    if (search.trim()) entries = entries.filter((e) => e.tr.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (sortBy === "name") entries = [...entries].sort((a, b) => a.tr.name.localeCompare(b.tr.name));
    if (sortBy === "plays") entries = [...entries].sort((a, b) => (b.tr.plays || 0) - (a.tr.plays || 0));
    return entries;
  };

  const onDrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };

  const minutes = Math.floor(stats.seconds / 60);
  let lvlIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (minutes >= LEVELS[i].min) lvlIdx = i;
  const nextLvl = LEVELS[lvlIdx + 1];
  const lvlProg = nextLvl ? (minutes - LEVELS[lvlIdx].min) / (nextLvl.min - LEVELS[lvlIdx].min) : 1;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "UP LATE" : hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
  const favCount = playlists.flatMap((p) => p.tracks).filter((t) => t.fav).length;

  // ═══ UI ATOMS ═══
  const Slider = ({ label, value, min, max, step, format, onChange, color = CYAN }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
  const Toggle = ({ label, on, onChange, color = CYAN }) => (
    <button onClick={() => onChange(!on)} style={{
      padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
      background: on ? color : "rgba(255,255,255,0.06)", color: on ? BG : "rgba(255,255,255,0.6)",
      border: on ? `1px solid ${color}` : BORDER,
    }}>{label}</button>
  );
  const Module = ({ title, children, extra }) => (
    <div style={{ background: CARD, border: BORDER, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.85)" }}>{title}</span>
        {extra}
      </div>
      {children}
    </div>
  );
  const chip = (active, color = CYAN) => ({
    padding: "9px 15px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
    background: active ? color : "rgba(255,255,255,0.06)", color: active ? BG : "rgba(255,255,255,0.75)",
    border: active ? `1px solid ${color}` : BORDER,
  });
  const bigBtn = (color = CYAN) => ({
    padding: "16px 10px", borderRadius: 12, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
    background: "rgba(255,255,255,0.05)", color, border: `1px solid ${color}44`, textAlign: "center",
  });

  // crisp SVG transport icons
  const PlayIcon = ({ size = 22, color = BG }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block", marginLeft: size * 0.08 }}>
      <path d="M8 5.6v12.8c0 .9 1 1.5 1.8 1l10-6.4c.7-.5.7-1.5 0-2l-10-6.4C9 4.1 8 4.7 8 5.6z" />
    </svg>
  );
  const PauseIcon = ({ size = 22, color = BG }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
      <rect x="6.2" y="4.8" width="4.2" height="14.4" rx="1.8" />
      <rect x="13.6" y="4.8" width="4.2" height="14.4" rx="1.8" />
    </svg>
  );
  const PrevIcon = ({ size = 17, color = "rgba(255,255,255,0.88)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
      <rect x="4.5" y="5" width="2.6" height="14" rx="1.3" />
      <path d="M19.5 6v12c0 1-1.1 1.5-1.9 1L9.3 13c-.7-.5-.7-1.5 0-2l8.3-6c.8-.5 1.9 0 1.9 1z" />
    </svg>
  );
  const NextIcon = ({ size = 17, color = "rgba(255,255,255,0.88)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
      <path d="M4.5 6v12c0 1 1.1 1.5 1.9 1l8.3-6c.7-.5.7-1.5 0-2l-8.3-6c-.8-.5-1.9 0-1.9 1z" />
      <rect x="16.9" y="5" width="2.6" height="14" rx="1.3" />
    </svg>
  );
  const skipBtn = {
    width: 42, height: 42, borderRadius: "50%", cursor: "pointer",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.13)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const playBtn = (size) => ({
    width: size, height: size, borderRadius: "50%", border: "none", cursor: "pointer",
    background: `linear-gradient(145deg, ${CYAN}, ${MAG})`,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 32px rgba(83,233,255,0.45), inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.25)",
  });

  const PresetRow = () => (
    <div className="hscroll" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 8 }}>
      <button onClick={saveUserPreset} style={chip(false, MAG)}>＋ SAVE FX</button>
      {userPresets.map((p, i) => (
        <span key={p.name} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => applyPreset(p)} style={chip(activePreset === p.name, MAG)}>★ {p.name}</button>
          <span onClick={() => setUserPresets((u) => u.filter((_, j) => j !== i))}
            style={{ position: "absolute", top: -5, right: -4, width: 15, height: 15, borderRadius: "50%", background: "#222", border: BORDER, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✕</span>
        </span>
      ))}
      {PRESETS.map((p) => (
        <button key={p.name} onClick={() => applyPreset(p)} style={chip(activePreset === p.name)}>{p.name}</button>
      ))}
      <button onClick={chaos} style={chip(activePreset === "??", MAG)}>🎲 CHAOS</button>
    </div>
  );

  const viewEntries = tab === "library" ? getView() : [];

  return (
    <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
      style={{ position: "fixed", inset: 0, background: BG, fontFamily: "'Space Grotesk', sans-serif", color: "#fff", display: "flex", flexDirection: "column", userSelect: "none" }}>
      <style>{CSS}</style>
      <canvas ref={bgRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px" }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.22em" }}>FLUX<span style={{ color: CYAN }}> PRO</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {recState === "rec" && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#FF4949" }}>● {fmt(recTime)}</span>}
          {sleepLeft && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: MAG }}>☾ {sleepLeft}</span>}
          <button onClick={() => setVisOpen(true)} style={{ padding: "7px 13px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: `linear-gradient(120deg, ${CYAN}, ${MAG})`, color: BG, border: "none" }}>◉ VISUALS</button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      <div style={{ position: "relative", flex: 1, overflowY: "auto", padding: "2px 18px 14px" }}>

        {tab === "player" && (
          <div className="pgrid">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 4 }}>
            <div style={{ position: "relative", width: "min(48vw, 205px)", aspectRatio: "1" }}>
              <div ref={discRef} style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: `repeating-radial-gradient(circle at 50% 50%, #14161c 0 2px, #1c1f27 2px 4px), radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14), transparent 55%)`,
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: "34%", height: "34%", borderRadius: "50%", background: `conic-gradient(from 0deg, ${CYAN}, ${MAG}, ${CYAN})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "22%", height: "22%", borderRadius: "50%", background: BG }} />
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", maxWidth: "88vw" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.24em", color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
                {track ? `${playingList.name} · ${String(current + 1).padStart(2, "0")}/${String(playingList.tracks.length).padStart(2, "0")} · ` : "NO SIGNAL"}
                {track && <span style={{ color: CYAN }}>BPM <span ref={bpmRef}>––</span></span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {track && (
                  <button onClick={() => toggleFav(track)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: track.fav ? MAG : "rgba(255,255,255,0.3)" }}>
                    {track.fav ? "♥" : "♡"}
                  </button>
                )}
                <div style={{ fontSize: "clamp(16px, 4.6vw, 23px)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "72vw" }}>
                  {track ? track.name : "Load music to begin"}
                </div>
              </div>
              {track && (
                <>
                  <div className="hscroll" style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 7, overflowX: "auto", maxWidth: "88vw" }}>
                    {TAGS.map((tg) => (
                      <button key={tg} onClick={() => toggleTag(track, tg)} style={{
                        padding: "4px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", flexShrink: 0,
                        background: track.tags?.includes(tg) ? "rgba(83,233,255,0.18)" : "rgba(255,255,255,0.04)",
                        color: track.tags?.includes(tg) ? CYAN : "rgba(255,255,255,0.45)",
                        border: track.tags?.includes(tg) ? `1px solid ${CYAN}88` : BORDER,
                      }}>{tg}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                    {activePreset && activePreset !== "CLEAN" && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: CYAN, border: `1px solid ${CYAN}55`, borderRadius: 6, padding: "2px 7px" }}>{activePreset}</span>
                    )}
                    <button onClick={togglePin} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: "pointer", color: track.fxPin ? BG : MAG, background: track.fxPin ? MAG : "transparent", border: `1px solid ${MAG}66`, borderRadius: 6, padding: "2px 7px" }}>
                      {track.fxPin ? "📌 PINNED" : "📌 PIN FX"}
                    </button>
                    <button onClick={() => setNoteOpen((x) => !x)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: "pointer", color: track.note ? BG : "rgba(255,255,255,0.6)", background: track.note ? CYAN : "transparent", border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 6, padding: "2px 7px" }}>
                      ✎ NOTE
                    </button>
                  </div>
                  {noteOpen && (
                    <textarea value={track.note || ""} onChange={(e) => { track.note = e.target.value; force((x) => x + 1); }}
                      placeholder="Your note on this track… (e.g. 'drop at 1:32 goes crazy')"
                      style={{ marginTop: 8, width: "min(88vw, 420px)", height: 54, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", padding: "8px 10px", fontSize: 12, resize: "none" }} />
                  )}
                </>
              )}
            </div>

            <div style={{ width: "100%", maxWidth: 620 }}>
              <canvas ref={waveRef} onMouseDown={waveSeek} onTouchStart={waveSeek} style={{ width: "100%", height: 50, cursor: "pointer", display: "block" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmt(progress)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmt(duration)}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
              <Toggle label="SHFL" on={shuffle} onChange={setShuffle} />
              <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
              <button onClick={togglePlay} style={playBtn(60)}>{playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}</button>
              <button onClick={nextTrack} style={skipBtn}><NextIcon /></button>
              <button onClick={() => setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off")} style={{
                padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: repeat !== "off" ? CYAN : "rgba(255,255,255,0.06)", color: repeat !== "off" ? BG : "rgba(255,255,255,0.6)", border: BORDER,
              }}>{repeat === "one" ? "⟳1" : "⟳"}</button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <button onClick={() => { if (loopA === null) setLoopA(progress); else if (loopB === null && progress > loopA) setLoopB(progress); else { setLoopA(null); setLoopB(null); } }}
                style={chip(loopA !== null, MAG)}>
                {loopA === null ? "LOOP A" : loopB === null ? "SET B" : "A↔B ✕"}
              </button>
              <Toggle label="VOCAL CUT" on={fx.vocalCut} onChange={(v) => setF("vocalCut", v)} color={MAG} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: 106 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>🔊</span>
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(+e.target.value)} />
              </div>
            </div>

            <div style={{ width: "100%", maxWidth: 640 }}><PresetRow /></div>
          </div>

          {/* side panel: up next + session pulse */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Module title="⏭ UP NEXT">
              {(() => {
                const list = playingList.tracks;
                if (!list.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>Queue is empty.</div>;
                const items = [];
                for (let k = 1; k <= 3; k++) {
                  const idx = current + k;
                  if (idx < list.length) items.push({ tr: list[idx], idx });
                  else if (repeat === "all" && list.length > 1) items.push({ tr: list[(idx) % list.length], idx: idx % list.length });
                }
                if (!items.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>End of queue.</div>;
                return items.map(({ tr, idx }, k) => (
                  <div key={`${tr.id}-${k}`} onClick={() => playAt(playPl, idx)} style={{
                    display: "flex", gap: 9, alignItems: "center", padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                    background: "rgba(255,255,255,0.03)", border: BORDER, marginBottom: 5,
                  }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: k === 0 ? CYAN : "rgba(255,255,255,0.4)" }}>{k === 0 ? "▶" : `+${k}`}</span>
                    <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "rgba(255,255,255,0.85)" }}>{tr.fav && "♥ "}{tr.name}</span>
                  </div>
                ));
              })()}
            </Module>
            <Module title="📊 SESSION PULSE">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {[[stats.plays, "PLAYS", CYAN], [`${minutes}m`, "TIME", MAG], [favCount, "FAVS", CYAN]].map(([v, l, col]) => (
                  <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.04)", borderRadius: 9 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, color: col }}>{v}</div>
                    <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(255,255,255,0.45)" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                {LEVELS[lvlIdx].name} · {nextLvl ? `${nextLvl.min - minutes}m to next rank` : "max rank"}
              </div>
            </Module>
          </div>
          </div>
        )}

        {tab === "dj" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, maxWidth: 640, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
              <div style={{ flex: 1, background: CARD, border: BORDER, borderRadius: 14, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)" }}>LIVE BPM</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 700, color: CYAN }}><span ref={bpmRef}>––</span></div>
              </div>
              <div style={{ flex: 1.4, background: CARD, border: BORDER, borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>OUTPUT LEVEL</div>
                <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div ref={levelRef} style={{ height: "100%", width: "0%", background: `linear-gradient(90deg, ${CYAN}, ${MAG})`, transition: "width 60ms linear" }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Slider label="SPEED" value={fx.speed} min={0.5} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setF("speed", v)} />
                </div>
              </div>
            </div>

            <Module title="🔥 HOT CUES">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {cues.map((cq, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <button onClick={() => setCue(i)} style={{
                      ...bigBtn(cq !== null ? MAG : CYAN), width: "100%",
                      background: cq !== null ? "rgba(255,78,205,0.14)" : "rgba(255,255,255,0.05)",
                    }}>
                      {["A", "B", "C", "D"][i]}
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, marginTop: 3, opacity: 0.8 }}>{cq !== null ? fmt(cq) : "SET"}</div>
                    </button>
                    {cq !== null && (
                      <span onClick={() => clearCue(i)} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#222", border: BORDER, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✕</span>
                    )}
                  </div>
                ))}
              </div>
            </Module>

            <Module title="⚡ PERFORMANCE FX">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                {[["STUTTER ⅛", 90], ["STUTTER ¼", 160], ["STUTTER ½", 300]].map(([lbl, ms]) => (
                  <button key={lbl}
                    onMouseDown={() => stutterDown(ms)} onMouseUp={stutterUp} onMouseLeave={stutterUp}
                    onTouchStart={(e) => { e.preventDefault(); stutterDown(ms); }} onTouchEnd={stutterUp}
                    style={bigBtn(CYAN)}>{lbl}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                <button onClick={brake} style={bigBtn(MAG)}>🛑 TAPE BRAKE</button>
                <button onClick={launch} style={bigBtn(CYAN)}>🚀 SPIN UP</button>
              </div>
            </Module>

            <Module title="🎯 SPEED NUDGE">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {[-0.1, -0.05, 0, 0.05, 0.1].map((d) => (
                  <button key={d} onClick={() => setF("speed", d === 0 ? 1 : Math.max(0.5, Math.min(1.5, +(fx.speed + d).toFixed(2))))} style={bigBtn(d === 0 ? MAG : CYAN)}>
                    {d === 0 ? "RESET" : (d > 0 ? `+${d}` : d)}
                  </button>
                ))}
              </div>
            </Module>
          </div>
        )}

        {tab === "fx" && (
          <div>
            <PresetRow />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
              <Module title="⏱ TIME & PITCH" extra={<Toggle label="TAPE" on={fx.vinyl} onChange={(v) => setF("vinyl", v)} />}>
                <Slider label="SPEED" value={fx.speed} min={0.5} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setF("speed", v)} />
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>TAPE on → pitch follows speed (slowed / nightcore).</div>
              </Module>
              <Module title="🌊 REVERB">
                <Slider label="MIX" value={fx.reverb} min={0} max={0.85} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("reverb", v)} />
                <Slider label="ROOM SIZE" value={fx.size} min={0.6} max={5.5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setF("size", v)} />
              </Module>
              <Module title="🔁 ECHO">
                <Slider label="MIX" value={fx.echoMix} min={0} max={0.7} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("echoMix", v)} />
                <Slider label="TIME" value={fx.echoTime} min={0.05} max={0.7} step={0.01} format={(v) => `${Math.round(v * 1000)}ms`} onChange={(v) => setF("echoTime", v)} />
                <Slider label="FEEDBACK" value={fx.echoFb} min={0} max={0.8} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("echoFb", v)} />
              </Module>
              <Module title="🎚 EQ">
                <Slider label="BASS" value={fx.bass} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setF("bass", v)} />
                <Slider label="MID" value={fx.mid} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setF("mid", v)} />
                <Slider label="TREBLE" value={fx.treble} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setF("treble", v)} />
              </Module>
              <Module title="🌀 8D SPIN" extra={<Toggle label={fx.spin ? "ON" : "OFF"} on={fx.spin} onChange={(v) => setF("spin", v)} />}>
                <Slider label="ORBIT SPEED" value={fx.spinRate} min={0.1} max={1.6} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setF("spinRate", v)} />
              </Module>
              <Module title="📻 TEXTURE">
                <Slider label="VINYL CRACKLE" value={fx.crackle} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("crackle", v)} />
                <Slider label="CRUSH" value={fx.crush} min={0} max={0.8} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("crush", v)} />
                <Slider label="TONE ▼" value={fx.tone} min={400} max={20000} step={50} format={(v) => (v >= 20000 ? "OPEN" : `${(v / 1000).toFixed(1)}k`)} onChange={(v) => setF("tone", v)} />
                <Slider label="THIN ▲" value={fx.highpass} min={20} max={1200} step={10} format={(v) => (v <= 20 ? "OFF" : `${v}Hz`)} onChange={(v) => setF("highpass", v)} />
              </Module>
              <Module title="🌧 AMBIENCE" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>UNDER THE MUSIC</span>}>
                <Slider label="RAIN" value={amb.rain} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAmb((a) => ({ ...a, rain: v }))} />
                <Slider label="FIREPLACE" value={amb.fire} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAmb((a) => ({ ...a, fire: v }))} />
                <Slider label="WIND" value={amb.wind} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAmb((a) => ({ ...a, wind: v }))} />
              </Module>
              <Module title="🔈 OUTPUT" extra={<Toggle label="VOCAL CUT" on={fx.vocalCut} onChange={(v) => setF("vocalCut", v)} color={MAG} />}>
                <Slider label="BOOST" value={fx.boost} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setF("boost", v)} />
              </Module>
            </div>
          </div>
        )}

        {tab === "library" && (
          <div>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Search your library…"
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", padding: "11px 13px", fontSize: 13, marginBottom: 10 }} />

            <div className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
              <button onClick={() => setViewMode({ type: "fav" })} style={chip(viewMode.type === "fav", MAG)}>♥ FAVORITES ({favCount})</button>
              <button onClick={() => setViewMode({ type: "recent" })} style={chip(viewMode.type === "recent")}>🕐 RECENT</button>
              {TAGS.map((tg) => (
                <button key={tg} onClick={() => setViewMode({ type: "tag", tag: tg })} style={chip(viewMode.type === "tag" && viewMode.tag === tg)}>#{tg}</button>
              ))}
            </div>
            <div className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, alignItems: "center" }}>
              {playlists.map((p) => (
                <button key={p.id} onClick={() => { setViewMode({ type: "pl", id: p.id }); setRenaming(false); setConfirmDel(false); }} style={chip(viewingPlId === p.id)}>
                  {p.name} <span style={{ opacity: 0.6 }}>({p.tracks.length})</span>
                </button>
              ))}
              <button onClick={newPlaylist} style={chip(false, MAG)}>＋ NEW</button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              {viewingPlId && (
                <>
                  <button onClick={() => fileInputRef.current.click()} style={{
                    flex: 1, minWidth: 160, padding: "11px", borderRadius: 12, cursor: "pointer",
                    background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)",
                    fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em",
                  }}>＋ LOAD INTO “{viewingList?.name}”</button>
                  {renaming ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <input type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renamePl()}
                        style={{ background: "rgba(255,255,255,0.07)", border: BORDER, borderRadius: 8, color: "#fff", padding: "8px 10px", fontSize: 12, width: 120 }} autoFocus />
                      <button onClick={renamePl} style={chip(true)}>✓</button>
                    </span>
                  ) : (
                    <button onClick={() => { setRenaming(true); setRenameVal(viewingList?.name || ""); }} style={chip(false)}>✎</button>
                  )}
                  {playlists.length > 1 && (
                    confirmDel
                      ? <button onClick={deletePl} style={chip(true, "#FF4949")}>SURE?</button>
                      : <button onClick={() => setConfirmDel(true)} style={chip(false, "#FF4949")}>🗑</button>
                  )}
                </>
              )}
              <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)" }}>SORT</span>
              {[["added", "ADDED"], ["name", "A-Z"], ["plays", "PLAYS"]].map(([k, l]) => (
                <button key={k} onClick={() => setSortBy(k)} style={chip(sortBy === k)}>{l}</button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {viewEntries.length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, padding: 24, textAlign: "center" }}>
                  {search ? "No matches." : viewMode.type === "fav" ? "No favorites yet — tap ♡ on a track." : viewMode.type === "recent" ? "Nothing played yet." : viewMode.type === "tag" ? "No tracks with this tag yet." : "This playlist is empty."}
                </div>
              )}
              {viewEntries.map(({ tr, plId, idx }) => {
                const isPlaying = playPl === plId && playingList.tracks[current]?.id === tr.id;
                const canReorder = viewMode.type === "pl" && sortBy === "added" && !search;
                return (
                  <div key={tr.id} style={{
                    padding: "10px 12px", borderRadius: 10, fontSize: 13.5, display: "flex", gap: 9, alignItems: "center",
                    background: isPlaying ? "rgba(83,233,255,0.1)" : CARD,
                    border: isPlaying ? `1px solid rgba(83,233,255,0.5)` : BORDER,
                  }}>
                    <button onClick={() => toggleFav(tr)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: tr.fav ? MAG : "rgba(255,255,255,0.25)", padding: 0 }}>
                      {tr.fav ? "♥" : "♡"}
                    </button>
                    <span onClick={() => playAt(plId, idx)} style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", color: isPlaying ? CYAN : "rgba(255,255,255,0.85)" }}>
                      {tr.fxPin && "📌 "}{tr.name}
                      {tr.tags?.length > 0 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{tr.tags.map((t2) => `#${t2}`).join(" ")}</span>}
                    </span>
                    {tr.plays > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, opacity: 0.4 }}>{tr.plays}×</span>}
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setRowMenu(rowMenu === tr.id ? null : tr.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 15 }}>⋯</button>
                      {rowMenu === tr.id && (
                        <div style={{ position: "absolute", right: 0, top: 24, zIndex: 5, background: "#14161d", border: BORDER, borderRadius: 10, padding: 6, width: 180, boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
                          <div onClick={() => playNext(tr)} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: CYAN }}>⏭ Play next</div>
                          {canReorder && <div onClick={() => { moveTrack(plId, idx, -1); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "rgba(255,255,255,0.85)" }}>▲ Move up</div>}
                          {canReorder && <div onClick={() => { moveTrack(plId, idx, 1); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "rgba(255,255,255,0.85)" }}>▼ Move down</div>}
                          <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", padding: "6px 8px 2px" }}>COPY TO…</div>
                          {playlists.filter((p) => p.id !== plId).map((p) => (
                            <div key={p.id} onClick={() => copyTrack(tr, p.id)} style={{ padding: "7px 8px", fontSize: 12.5, cursor: "pointer", color: CYAN }}>→ {p.name}</div>
                          ))}
                          <div onClick={() => removeTrack(tr.id, plId)} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "#FF6B6B", borderTop: BORDER, marginTop: 4 }}>✕ Remove</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "me" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, maxWidth: 640, margin: "0 auto" }}>
            <div style={{ background: `linear-gradient(135deg, rgba(83,233,255,0.12), rgba(255,78,205,0.12))`, border: BORDER, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.24em", color: "rgba(255,255,255,0.55)" }}>{greeting} · LEVEL {lvlIdx + 1}</div>
              <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 10px" }}>{LEVELS[lvlIdx].name}</div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round(lvlProg * 100)}%`, background: `linear-gradient(90deg, ${CYAN}, ${MAG})` }} />
              </div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                {nextLvl ? `${minutes} min listened — ${nextLvl.min - minutes} min to ${nextLvl.name}` : `${minutes} min listened — max level!`}
              </div>
            </div>

            <Module title="⏺ SESSION RECORDER" extra={recState === "rec" && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#FF4949" }}>● {fmt(recTime)}</span>}>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 10 }}>
                Records everything you hear — FX, stutters, brakes, ambience — then download the take.
              </div>
              {recState === "idle"
                ? <button onClick={startRec} style={{ ...bigBtn("#FF4949"), width: "100%" }}>● START RECORDING</button>
                : <button onClick={stopRec} style={{ ...bigBtn("#FF4949"), width: "100%", background: "rgba(255,73,73,0.15)" }}>■ STOP & SAVE TAKE</button>}
              {exports.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {exports.map((ex) => (
                    <a key={ex.id} href={ex.url} download={ex.name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "rgba(83,233,255,0.08)", border: `1px solid ${CYAN}44`, color: CYAN, textDecoration: "none", fontSize: 12.5, fontWeight: 700 }}>
                      <span>⬇ {ex.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>{fmt(ex.secs)}</span>
                    </a>
                  ))}
                </div>
              )}
            </Module>

            <Module title="📊 SESSION STATS">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: CYAN }}>{stats.plays}</div>
                  <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>PLAYS</div>
                </div>
                <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: MAG }}>{minutes}<span style={{ fontSize: 13 }}>m</span></div>
                  <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>LISTENED</div>
                </div>
                <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: CYAN }}>{favCount}</div>
                  <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>FAVORITES</div>
                </div>
              </div>
              {(() => {
                const all = playlists.flatMap((p) => p.tracks).filter((tr) => tr.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 3);
                return all.length ? (
                  <div>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>MOST PLAYED</div>
                    {all.map((tr, i) => (
                      <div key={tr.id} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "5px 0", color: "rgba(255,255,255,0.8)" }}>
                        <span style={{ color: CYAN, fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}.</span>
                        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.name}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.5 }}>{tr.plays}×</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </Module>

            <Module title="⚙ PLAYBACK">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Toggle label="SMOOTH SWITCH" on={smooth} onChange={setSmooth} />
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>fade between tracks</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>SLEEP TIMER</span>
                {[15, 30, 60].map((m) => (
                  <button key={m} onClick={() => setSleepEnd(Date.now() + m * 60000)} style={chip(false)}>{m}m</button>
                ))}
                {sleepEnd && <button onClick={() => setSleepEnd(null)} style={chip(true, MAG)}>✕ {sleepLeft}</button>}
              </div>
            </Module>

            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, padding: "0 4px" }}>
              Session lives in memory — favorites, tags, notes, presets and takes reset when the artifact closes. The Claude Code build makes all of this permanent.
            </div>
          </div>
        )}
      </div>

      {/* bottom tabs */}
      <div style={{ position: "relative", display: "flex", borderTop: BORDER, background: "rgba(10,11,16,0.85)", backdropFilter: "blur(16px)" }}>
        {[["player", <PlayIcon key="i" size={15} color="currentColor" />, "PLAYER"], ["dj", "🎧", "DJ"], ["fx", "🎛", "FX"], ["library", "≡", "LIBRARY"], ["me", "👤", "ME"]].map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "11px 0 13px", background: "transparent", border: "none", cursor: "pointer",
            color: tab === id ? CYAN : "rgba(255,255,255,0.45)",
            borderTop: tab === id ? `2px solid ${CYAN}` : "2px solid transparent",
          }}>
            <div style={{ fontSize: 15, display: "flex", justifyContent: "center" }}>{icon}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, marginTop: 2 }}>{label}</div>
          </button>
        ))}
      </div>

      {/* ═══ FULLSCREEN VISUALIZER ═══ */}
      {visOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#05060A" }}>
          <canvas ref={visRef} onClick={() => setVisPanel(false)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

          <div style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {VIS_THEMES.map((v) => (
                <button key={v} onClick={() => setVisTheme(v)} style={chip(visTheme === v)}>{v}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={visChaos} style={chip(false, MAG)}>🎲</button>
              <button onClick={() => setVisPanel((x) => !x)} style={chip(visPanel, MAG)}>⚙ TUNE</button>
              <button onClick={() => setVisOpen(false)} style={{ ...chip(false), fontSize: 14 }}>✕</button>
            </div>
          </div>

          {visPanel && (
            <div style={{ position: "absolute", top: 62, right: 16, width: "min(88vw, 330px)", maxHeight: "68vh", overflowY: "auto", background: "rgba(10,12,18,0.93)", border: BORDER, borderRadius: 16, padding: 14, backdropFilter: "blur(20px)", zIndex: 5 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>COLOR PALETTE — {PALETTES.length - 1} + CUSTOM</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {PALETTES.map((p) => {
                  const ph1 = p.h ? p.h[0] : visCfg.h1;
                  const ph2 = p.h ? p.h[1] : visCfg.h2;
                  return (
                    <button key={p.id} onClick={() => setV("palette", p.id)} style={{
                      padding: "7px 11px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                      background: visCfg.palette === p.id ? `linear-gradient(90deg, hsl(${ph1},${p.s}%,60%), hsl(${ph2},${p.s}%,60%))` : "rgba(255,255,255,0.06)",
                      color: visCfg.palette === p.id ? "#05060A" : "rgba(255,255,255,0.7)",
                      border: BORDER,
                    }}>{p.id}</button>
                  );
                })}
              </div>
              {visCfg.palette === "CUSTOM" && (
                <div style={{ marginBottom: 6 }}>
                  <Slider label="COLOR A" value={visCfg.h1} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h1", v)} color={`hsl(${visCfg.h1},100%,62%)`} />
                  <Slider label="COLOR B" value={visCfg.h2} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h2", v)} color={`hsl(${visCfg.h2},100%,62%)`} />
                </div>
              )}

              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>LIGHT</div>
              <Slider label="GLOW" value={visCfg.glow} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("glow", v)} />
              <Slider label="TRAILS" value={visCfg.trail} min={0} max={0.95} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("trail", v)} />
              <Slider label="BG WASH" value={visCfg.bgWash} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("bgWash", v)} />
              <Slider label="THICKNESS" value={visCfg.thick} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("thick", v)} />

              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>MOTION</div>
              <Slider label="ANIM SPEED" value={visCfg.speed} min={0.2} max={2.2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("speed", v)} />
              <Slider label="REACTIVITY" value={visCfg.intensity} min={0.3} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("intensity", v)} />
              <Slider label="ZOOM" value={visCfg.zoom} min={0.6} max={1.6} step={0.02} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("zoom", v)} />
              <Slider label="SCENE SPIN" value={visCfg.spinV} min={-1} max={1} step={0.05} format={(v) => (Math.abs(v) < 0.05 ? "OFF" : v.toFixed(2))} onChange={(v) => setV("spinV", v)} />

              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>PARTICLES</div>
              <Slider label="COUNT" value={visCfg.particles} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 150)}`} onChange={(v) => setV("particles", v)} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {P_STYLES.map((s) => (
                  <button key={s} onClick={() => setV("pStyle", s)} style={{ ...chip(visCfg.pStyle === s), padding: "6px 11px", fontSize: 9.5 }}>{s}</button>
                ))}
              </div>

              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>IMPACT</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Toggle label="BEAT FLASH" on={visCfg.flash} onChange={(v) => setV("flash", v)} />
                <Toggle label="BEAT SHAKE" on={visCfg.shake} onChange={(v) => setV("shake", v)} />
                <Toggle label="MIRROR" on={visCfg.mirror} onChange={(v) => setV("mirror", v)} />
                <Toggle label="AUTO-CYCLE" on={visCfg.autoCycle} onChange={(v) => setV("autoCycle", v)} color={MAG} />
              </div>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1.5 }}>
                🎲 randomizes the whole look. Auto-cycle rotates themes every ~16s.
              </div>
            </div>
          )}

          <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            {visTheme !== "CLOCK" && (
              <div style={{ fontSize: "clamp(15px, 3.6vw, 22px)", fontWeight: 700, maxWidth: "84vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0 24px rgba(83,233,255,0.6)" }}>
                {track ? track.name : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 20, pointerEvents: "auto" }}>
              <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
              <button onClick={togglePlay} style={playBtn(52)}>{playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}</button>
              <button onClick={nextTrack} style={skipBtn}><NextIcon /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
