# Flux — Visualizer Brief

*A hand-off brief for the agent designing and building Flux's new visualizers.
Paste everything below the line as your task. You have the repository open.*

---

You are the creative director and graphics engineer for the visualizers in
**Flux**, a music player (React 18 + TypeScript + Vite; ships as a web app /
PWA, an Electron desktop app for Windows and macOS, and a Capacitor Android
app). Everything else in the app has just been redesigned. The visualizers are
the one part the owner is unhappy with, and they are now yours.

## The assignment

**Design and build a brand-new collection of music visualizers for Flux, and
remove the existing ones entirely.** You have complete creative control: the
concepts, the art direction, the rendering technology, how many there are, what
they are called, what their controls are. Aim for a collection that would make
someone open Flux just to watch it — the standard is a high-end interactive
art piece or a live show's visual rig, not a media-player plug-in.

Aim for roughly 8–12 visualizers that are genuinely different from one another
— different composition, different material, different relationship to the
music — rather than one technique in several colours. Fewer, finished pieces
beat many thin ones.

### The one hard creative rule

**Nothing you make may resemble the current visualizers.** The owner's words:
they look "really cheap", "bleh", and "old". Open `src/stage/modes/` and look
at all seven before you design anything, so you know exactly what to stay away
from:

| Current mode | What it is | 
| --- | --- |
| Veil | flat 2D shader: noise "aurora curtains" over a dark horizon |
| Ink | flat 2D shader: domain-warped fbm "marbling" |
| Caustic | flat 2D shader: ridged-noise "pool light" web |
| Orbit | canvas 2D: ellipse orbits with glowing dots |
| Signal | canvas 2D: grid of flat geometric poster shapes |
| Ridge | canvas 2D: stacked spectrum outlines ("Unknown Pleasures") |
| Words | canvas 2D: the lyric line set in big flat type |

Why they read as cheap, so you can avoid the *causes* and not just the
subjects: they are flat, full-screen procedural-noise fields or basic 2D
canvas drawing; there is no real lighting, material, depth, or camera; they are
rendered at reduced resolution with visible softness and banding; there is no
post-processing to speak of; and the music mostly just scales brightness or
size. They look like shader-toy demos from a decade ago.

So: no aurora/curtain/nebula noise fields, no marbled fbm, no voronoi/caustic
webs, no orbiting dots, no flat shape grids, no spectrum bars or stacked
waveform lines, no plain big-text mode, no starfields, tunnels or generic
particle fountains. If a concept could be described as "a classic visualizer",
it is the wrong concept.

### What "good" looks like here

These are directions, not requirements — bring your own ideas:

- **Real depth and light.** Actual 3D scenes with a camera, physically
  plausible materials (metal, glass, liquid, fabric, ceramic, light itself),
  shadows, reflections, refraction, volumetrics.
- **Cinematic finishing.** HDR rendering with a proper tone map, bloom that
  behaves like a lens, depth of field, chromatic dispersion, film grain,
  motion blur where it earns it. Crisp at native resolution.
- **Simulation and behaviour.** GPU particle systems with real forces, fluid
  or smoke simulation, cloth, soft bodies, growth systems, flocking,
  reaction–diffusion, raymarched SDF forms — things that *behave*, so the
  music can push on them instead of just brightening them.
- **Art direction.** Each visualizer should have a point of view you could
  describe in a sentence a designer would say, a restrained palette strategy,
  and a composition that would work as a still frame.
- **Musicality.** Different instruments should do visibly different things.
  Quiet passages should be beautiful, not just dim. Builds should build. A
  drop should be an event. Nothing should strobe.
- **Typography, if you use it,** should be real typographic craft (3D or SDF
  type, kinetic lyric staging), never plain text on a canvas.

You may add dependencies (three.js, a post-processing library, etc.) if they
earn their size. WebGL2 is the baseline that must work everywhere; WebGPU is
welcome as a progressive enhancement, never a requirement.

## What you own, and the boundary

**You own everything under `src/stage/`.** Delete it and start again if you
like — the engine, the compositor, the shader plumbing, all seven modes. The
rest of the app talks to it through a small surface, listed here. Keep these
exports working (same names and shapes) and nothing else needs to know what
you did:

**`src/stage/engine.ts`**
- `stage.attach(canvas: HTMLCanvasElement): void` — called once by
  `src/App.tsx` with a full-window canvas. Start your render loop here.
- `stage.detach(): void` — stop and release everything.
- `stage.setPresence(p: Partial<Presence>): void` where
  `Presence = { show: boolean; calm: number; dim: number; paper: number }`.
  `show: false` means the stage is not visible — **stop rendering completely**
  (this is the state on every view except the two below). `calm` is 0 in the
  immersive stage and ~0.15 when the stage is the live preview behind the
  Studio panel. `dim` is overall brightness 0–1; ease changes, never snap.
  `paper` is legacy and can be ignored.
- `stage.thumbnail(look: Look, w?: number, h?: number): Promise<string>` —
  a data-URL still of a look, used for the preview cards in Studio. It must
  represent what the look really looks like, in that look's colours, and must
  not stall the main thread (render in idle time, cache by look).
- `stage.canvas` — the attached canvas (the video recorder draws it into its
  capture; keep the drawing buffer readable when a recording is running, e.g.
  honour `preserveDrawingBuffer` or re-present each frame).
- `stageInfo: { gl: boolean; fps: number; scale: number; frameMs: number;
  mode: string; error: string }` — live status. `mode` must hold the id of the
  visualizer currently drawing; `error` must be `""` when healthy and a short
  message on shader/asset failure. It is exposed as `window.__fluxStage` and
  the test suites and the desktop launch check read it.
- `resolvePalette(look: Look): [string, string, string, string, string]` —
  five hex colours, dark → light, for the look's colour source.

**`src/stage/modes/index.ts`**
- `MODES: ModeDef[]` and `modeById(id): ModeDef`, where the app reads only
  these fields: `id`, `name`, `line` (one-line description), `reacts` (one
  line on what the music does to it), `dials: [string, string]` (labels for
  the two per-visualizer controls), and `ownsLyrics?: boolean` (set it when
  the visualizer stages the lyrics itself, and the app's own lyric overlay
  stays out of the way).

**`src/stage/modeIds.ts`**
- `MODE_IDS: string[]` — just the ids, with **no imports**, because the store
  loads it before any renderer.

You may also change `src/ui/Studio.tsx` (the Style section and its preview
cards) and `src/ui/Stage.tsx` (the immersive stage's chrome: mode switcher,
transitions between visualizers, the aperture entrance) if your work needs a
different picker or a better entrance. Leave the rest of `src/ui/` alone.

## What you are given each frame

Do not build your own audio analysis. Flux already has a careful one, and the
honesty of its beat tracking is a feature you must preserve.

**`src/flux/signals.ts`** — the app updates these once per frame before your
loop runs (see `src/flux/runtime.ts`); just read `sig`. Do not call
`updateSignals` yourself.

- Measured, always available with audio: `level` (fast loudness),
  `energy` (slow intensity over seconds: calm verse vs driving chorus),
  bands `sub` `bass` `lowMid` `mid` `high` `air` (0–1, auto-gained, with
  attack/release), `spectrum` (48 log-spaced bands), `wave` (256 samples),
  `transient` (onset envelope) and `onset` (true on the frame one lands).
- Inferred, with a trust value: `bpm`, `phase` (0–1 within the beat),
  `barPhase` (0–1 within the bar), `beatIndex`, `onBeat` / `onBar` (true for
  one frame), `pulse` (beat envelope), and **`confidence`** (0–1).
- From the offline analysis when present: `drop` (0–1 envelope swelling into
  and decaying out of the track's biggest lifts) and `section` (a counter that
  increments when the arrangement changes character).
- `playing`, `live` (false when paused, or for YouTube tracks, which cannot be
  analysed at all), `t` (audible media time), `dt`.

**The beat rule.** Only lock motion to `phase`/`onBeat`/`pulse` when the beat
is trustworthy; otherwise react to `transient`, bands and `energy`. The
existing engine shows the intended blend (`buildFrame` in the current
`engine.ts`): a `grid` weight from `smoothstep` of `sig.confidence`, shaped by
the user's Rhythm setting (`look.intensity.rhythm`: `"auto"`, `"beat"`,
`"energy"` — `"energy"` must never snap to a grid). Never invent a pulse.
`onBeat` never fires on a seek, in a beatless passage, or while paused — keep
it that way by using it rather than deriving your own.

**`src/flux/clock.ts`** — `clock.audible()` is the playback position as heard;
`clock.epoch` increments on every seek, loop, track change and repeat. Reset
any accumulated state that should not survive a jump.

**The look** — `useStore.getState().look` (`src/flux/look.ts`):
`style { mode, a, b }` (your visualizer id and its two dials, 0–1),
`color { source, warmth, vivid }` (use `resolvePalette`; `"artwork"` follows
the playing record's cover and changes on every track — glide between
palettes, never cut), `motion { speed, drift }` (`drift` = how much it moves on
its own in silence), `intensity { react, rhythm, accents, texture }`.
Every one of these must have a visible effect in every visualizer. If your
visualizers need more than two dials or a different colour model, you may
extend the `Look` type — then also update `sanitizeLook`, the defaults, the
Studio controls, and add a store migration (see below).

**Lyrics** — `lineAt(lines, t)` and `wordAt(line, t)` in
`src/flux/lyricTime.ts` give the active line and word from the track's
`lyrics` (`getCurrentTrack(useStore.getState())`). Word timing exists only on
some tracks (`line.words`); when it is absent, light the whole line — never
fake per-word timing. Respect `lyricsOn`, `lyricPrefs.show`,
`lyricPrefs.offsetMs` and `track.lyricOffset` (both are subtracted from the clock: positive = lyrics later), and `track.lyricsTimed === false` (untimed text: do not
stage it as if it were synced).

**Artwork** — `artNow(track)` in `src/flux/art.ts` gives `{ url, palette,
accent, accent2 }`. The cover image itself is fair game as a texture.

## Engineering requirements

- **Performance is part of the design.** 60fps at native resolution on a
  recent laptop's integrated GPU; a quality governor that sheds resolution and
  effects before it sheds frames; honour the user's Quality setting
  (`useStore.getState().quality`: `auto`, `high`, `balanced`, `saver` — saver
  is half resolution at 30fps). Phones (iOS Safari, Android WebView) must get
  a real, good-looking tier, not a broken one.
- **Idle cost.** Zero work when `show` is false. Reduced rate when paused.
- **Robustness.** Handle `webglcontextlost`/`restored`, resize, DPR changes
  and background tabs. If WebGL2 is unavailable, show something intentional
  and set `stageInfo.gl = false`. A failed shader must set `stageInfo.error`
  and fall back, never show a black screen silently.
- **Offline and self-contained.** No runtime network requests: bundle every
  texture, model, font and LUT. Assets must load under `file`-like origins
  (the desktop app serves from `flux://app/`) and under a sub-path
  (`base: "./"` in Vite). Keep the added download reasonable; lazy-load heavy
  per-visualizer assets.
- **Transitions.** Switching visualizers must be a designed transition that
  can be interrupted by another switch at any moment, with no flash or frame
  hitch. Palette changes glide.
- **Accessibility.** No full-frame flashes above ~3 Hz. When
  `document.documentElement.dataset.motion === "minimal"`, drop camera shake
  and strobing accents and shorten transitions.
- **Readable overlay.** The app draws lyrics and playback controls over the
  stage in near-white. Keep the areas behind them calm and dark enough, or set
  `ownsLyrics` and stage the words yourself.
- **Code quality.** TypeScript strict, no `any` leaks into the app, one module
  per visualizer, comments that explain intent. `npm run build` must pass.

## Features the visualizer picker used to have — bring them back

The old system had these and the owner wants them again, in your picker:

- **Favourites:** star a visualizer; starred ones sort first.
- **Auto-change:** off / cycle in order / shuffle, moving to another
  visualizer every so often (on a musical boundary — `sig.section` changing or
  a bar line — rather than mid-phrase), using your transition.
- **Share codes:** copy the current look as a short self-contained code and
  paste one to apply it (validate pasted input with `sanitizeLook`).

Persist whatever state these need in the store (`src/store/useStore.ts`,
added to `partialize`).

## Housekeeping that goes with new visualizers

1. `src/stage/modeIds.ts` — the new ids.
2. `src/flux/look.ts` — `DEFAULT_LOOK`, `BUILTIN_PRESETS` (write new curated
   looks with good names — these are the first thing people see in Studio),
   and `THEME_TO_MODE` (maps the app's much older theme names to a current
   mode; point each group at your nearest equivalent).
3. `src/store/useStore.ts` — bump the persist `version` and add a migration
   that maps the seven old mode ids (`veil ink caustic orbit signal ridge
   words`) in `look` and in every `lookPresets[].look` to a new id, so nobody's
   saved looks break. `sanitizeLook` already falls back to the default for an
   unknown id; a deliberate mapping is better.
4. Tests that name the old modes — update them to your ids and keep them
   passing: `scripts/smoke.mjs` (mode list, "Pool Light" preset, the
   migration expectations `orbit` / `ink` / `signal` / `caustic`) and
   `scripts/ai-smoke.mjs` (the fake AI reply `mode: "Caustic"`).
5. `README.md` — the stage section and its table.
6. `src/ai/context.ts` builds its description of the visualizers from `MODES`
   automatically; make sure `line` and `dials` read well, since an AI feature
   uses them to pick a visualizer from a text prompt.

## How to work

1. Read `src/stage/` (to know what to replace and avoid), `src/flux/signals.ts`,
   `src/flux/clock.ts`, `src/flux/look.ts`, `src/ui/Stage.tsx`,
   `src/ui/Studio.tsx`.
2. Run it: `npm install`, `npm run dev`. Drop an audio file on the window,
   press **V** for the immersive stage, open **Studio** for the controls.
3. Write a short creative direction first: the collection's point of view and
   a one-paragraph concept for each visualizer. Then build them one at a time
   to a finished standard, looking at each with real music of several kinds
   (sparse piano, a dense electronic drop, a vocal ballad, something with no
   steady beat) before moving on.
4. Verify: `npm run build`, then `node scripts/smoke.mjs`, `npm run sync`
   (beat and lyric timing — must still pass untouched) and
   `npm run smoke:ai`. Check a phone-sized viewport and the Quality settings.
5. Finish with: what you built, what each visualizer does with the music, the
   performance you measured, and anything you would still improve.

Do not change the audio engine, the signal analysis, the clock, the lyrics
system, the library, or the rest of the interface. Make the visualizers
extraordinary.
