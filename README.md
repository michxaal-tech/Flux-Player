# FLUX PRO

Local music player with a live Web Audio FX rack, DJ performance deck, and a 43-theme
audio-reactive visualizer — the production build of the `flux-studio-pro.tsx` prototype
(kept as the design spec in [`docs/prototype/`](docs/prototype/flux-studio-pro.tsx)).

Everything runs in the browser: your audio never leaves the device.

## Run it

```bash
npm install
npm run dev        # dev server
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
node scripts/smoke.mjs   # headless end-to-end smoke test (after build)
```

## Features

- **Player** — drag-and-drop or file-picker import, decoded waveform seekbar,
  A-B loop, shuffle/repeat, crossfaded track switching, favorites/tags/notes,
  per-track pinned FX, up-next queue, session stats + listener levels.
- **FX rack** — speed with tape mode (pitch-follow), convolution reverb, echo,
  3-band EQ, 8D auto-pan, vinyl crackle, bit-crush drive, tone/highpass filters,
  vocal cut (mid-side cancel), output boost — plus 11 factory presets, saveable
  user presets, and a chaos randomizer. Ambience generators (rain / fireplace /
  wind) are synthesized in the audio graph, no samples.
- **DJ deck** — live BPM detection, output meter, 4 hot cues, hold-to-stutter
  (⅛/¼/½), tape brake & spin-up, speed nudge.
- **Visualizer** — 75 canvas themes × 31 palettes (+ custom hue pair), including
  5 staged themes (◈) whose effects layer in as the arrangement builds and
  detonate on drops, and 2 natively 3D ones. Any theme can be projected into 3D
  (floor plane, corridor, rotating panel, extruded tunnel). 15 tune
  controls (glow, trails, particles w/ 4 styles, reactivity, zoom, scene spin,
  mirror, beat flash/shake, auto-cycle), edge spectrum meters on every tab.
  Adaptive resolution keeps full-screen rendering at 60fps on any device (or
  pin MAX SHARPNESS to disable it). Themes also read a smoothed musical
  "energy" signal, so they move differently in a song's calm and driving parts.
  Analysis is delayed to compensate for audio output latency, so beats land on
  the sound rather than ahead of it (with a BEAT SYNC offset for Bluetooth).
- **Synced lyrics** — lrclib.net lookup with filename analysis + confidence
  scoring, auto-search per track, .lrc import, 14 animation styles drawn on
  a dedicated canvas layer.
- **Recorder** — captures the master output (FX, stutters, ambience included)
  via MediaRecorder; takes are stored and downloadable.
- **Offline export** — renders a whole track through the FX graph with
  `OfflineAudioContext` (pinned FX or the live rack) and encodes **WAV** or
  **MP3** (lamejs). Note: offline speed always follows pitch (tape behavior);
  live non-tape stretching has no offline equivalent.
- **Instrumental mode (on-device AI)** — "MAKE INSTRUMENTAL" on the player
  runs MDX-Net source separation entirely in the browser (onnxruntime-web
  in a Web Worker, custom 6144-point STFT): vocals removed, nothing
  uploaded. The ~64MB model downloads once and is cached; each track's
  instrumental is stored beside the original with a live A/B toggle.
- **Persistence** — audio files live in IndexedDB (OPFS fallback); playlists,
  favorites, tags, notes, pinned FX, presets, stats, takes and visualizer
  settings persist via Zustand + localStorage. Everything survives restarts.
- **Media Session** — lock-screen/notification controls with metadata and
  seek support.
- **PWA** — installable, offline-capable app shell (hand-rolled service
  worker), generated icons (`npm run icons` regenerates them).
- **Keyboard shortcuts** — press `?` for the panel. Drag to reorder playlist
  chips and track rows.

## Structure

```
src/
  audio/        engine (Web Audio graph), transport, recorder, peaks,
                offline FX render + WAV/MP3 encoders, store wiring
  components/   one file per tab (Player, DJ, FXRack, Library, Me),
                visualizer overlay, shortcuts panel, shared UI atoms
  visualizer/   render loop engine, live (mutable frame state),
                themes/ — one file per theme; register new ones in themes/index.ts
  store/        zustand store (persisted) + blob storage (IndexedDB/OPFS)
  hooks/        keyboard, media session, sleep timer
```

### Adding a visualizer theme

Create `src/visualizer/themes/mytheme.ts` exporting a `ThemeDraw`, register it
in `themes/index.ts`, and add its name to `VIS_THEMES` in `src/constants.ts`.
The draw context gives you the canvas, FFT/waveform data, beat flag,
palette helpers (`C1`/`C2`/`CMix`), and a scratch state bucket (`L`).

## Optional AI layer (BYOK)

FLUX works completely without AI. Add an API key in **ME → AI SETTINGS** and a
`✦` layer appears across the app; remove the key and every AI surface
disappears again. Keys are stored only in this browser (IndexedDB, one per
provider) and are sent only to the provider you pick — there is no backend.

**Providers.** Because FLUX is serverless, calls go straight from the browser,
so a provider must answer CORS preflights from a page origin. Three do:

| Provider | Cost | Notes |
| --- | --- | --- |
| **Google Gemini** (default) | Free | ~1,500 req/day, 15/min on Flash. No credit card. Native JSON mode. Google may train on free-tier prompts. |
| **Anthropic** | Paid | Best quality. Billed to your own account; not covered by a Claude Pro/Max subscription. |
| **OpenAI-compatible** | Varies | Groq, OpenRouter, Cerebras or any custom base URL + model. |

Each provider only describes how to shape a request and read the reply
(`src/ai/providers.ts`), so every feature below works unchanged across all of
them.

Every feature speaks one command protocol (`src/ai/commands.ts`): Claude returns
`{reply, actions[]}` and the app executes the actions (`fx`, `visuals`, `queue`,
`playlist`, `say`, `sleepTimer`, `tags`, `note`, `preset`, `cover`, `ui`).
Values are clamped to the real slider ranges before they are applied, and
malformed JSON is repaired with one automatic retry. Adding a feature means
writing a prompt in `src/ai/features.ts`, not new plumbing.

- **Copilot + Voice DJ** — chat or speak to control the whole app
- **Vibe to FX / Vibe to Visuals** — describe a feeling, get a preset or a look
- **Library** — auto-tag (with review), genre sorter, AI playlists, daily mix,
  smart shuffle (energy arc), emoji search, BPM coach, SVG cover art
- **Atmosphere** — radio host & hype man between tracks, sleep story DJ with an
  FX wind-down ramp, mood check-in, preset packs, time machine, dream setlist,
  studio notes
- **Fun** — taste roast, FLUX Wrapped card, weekly rewind, album critic, trivia,
  track duel, AI take naming

Run `node scripts/ai-smoke.mjs` to exercise the whole layer against a mocked
Anthropic endpoint (no key or network required).
