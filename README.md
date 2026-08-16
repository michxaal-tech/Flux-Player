# FLUX PRO

Local music player with a live Web Audio FX rack, DJ performance deck, and a 33-theme
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
- **Visualizer** — 33 canvas themes × 15 palettes (+ custom hue pair), 15 tune
  controls (glow, trails, particles w/ 4 styles, reactivity, zoom, scene spin,
  mirror, beat flash/shake, auto-cycle), edge spectrum meters on every tab.
- **Recorder** — captures the master output (FX, stutters, ambience included)
  via MediaRecorder; takes are stored and downloadable.
- **Offline export** — renders a whole track through the FX graph with
  `OfflineAudioContext` (pinned FX or the live rack) and encodes **WAV** or
  **MP3** (lamejs). Note: offline speed always follows pitch (tape behavior);
  live non-tape stretching has no offline equivalent.
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
