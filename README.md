# FLUX PRO

Local music player with a live Web Audio FX rack, DJ performance deck, and an 80-theme
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
- **Visualizer** — 85 canvas themes × 41 palettes (+ custom hue pair), including
  10 multi-colour ones (RAINBOW, PRISM, PLASMA, MIAMI, OPAL, TIEDYE, BOREALIS,
  REEF, SLICK, CITRUS): a palette is a list of hue stops rather than a pair, and
  a list of three or more becomes a cycle the whole scene walks through over
  about half a minute, so even a theme that only draws two colours passes through
  the entire spectrum. Also including
  15 staged themes (◈) whose effects layer in as the arrangement builds, most of
  them natively 3D (real perspective projection and depth sorting), plus 2 more
  3D ones. Any theme can be projected into 3D
  eight ways (floor plane, corridor, flying tunnel, vortex, rotating panel,
  cube, dome, cylinder). **Drop layers**: every drop the analyser finds adds a
  persistent layer to the picture — orbit rings carrying travelling lights, god
  rays, rising embers, luminous constellations, falling light, tumbling shards
  and more — and it *stays*, swelling in over a couple of beats as it arrives. When the track calms the
  newest layers thin out; when it lifts they come back, so a song builds through
  its length instead of flashing at each drop. All 85 themes have their own set of 7 from a
  library of 28 — every set unique, 25 different opening layers, checked by
  `node scripts/layers-check.mjs` since a missing or misspelt entry fails
  silently rather than visibly. Drawn in the theme's own space (so a 3D projection carries them onto
  the surface with everything else), and a PREVIEW DEPTH stepper auditions any
  depth without waiting for a drop. Five themes — STRATA, CROWN, CASCADE,
  FISSION, PARALLAX — are built around this: each drop adds another stratum,
  tier, terrace, shell or depth plane to their own structure.
  44 per-letter lyric effects — colour ramps, per-letter motion, karaoke
  fills and text treatments — compose with the 20 line animations. 15 tune
  controls (glow, trails, particles w/ 4 styles, reactivity, zoom, scene spin,
  mirror, beat flash/shake, auto-cycle), starrable favourites pinned to the top
  of the theme picker, saveable looks with self-contained share codes, 34 stackable beat impacts (including a signature set with a frame
  history behind it — ghosting, datamosh, melt, fracture), 20 particle drifts × 12
  silhouettes × 3 size spreads × a size multiplier, edge spectrum meters on every tab.
  A **highlight rolloff** keeps bright centres from blinding you. The trail
  buffer keeps (1 - fade) of each frame and adds the next, so anything that
  doesn't move converges to about 4.7x its per-frame brightness at the default
  TRAILS — which is why it was always the centre, where themes put the thing
  that sits still. One masked pass compresses only what is above ~83% luminance,
  so it fixes every theme at once instead of retuning eighty of them.
  Adaptive **quality** keeps full-screen rendering at 60fps on any device: one
  measured signal drives backing resolution, glow radius and particle count
  together. Glow is what actually costs — WAVES renders 6× faster with it off
  and RING 2.4×, while particle count barely registers — so capping blur radius
  degrades far more gracefully than shrinking the canvas, and trading only
  resolution left the heavy themes stuck at 290ms/frame. QUALITY in the TUNE
  panel pins it high (MAX) or low (FAST) if you'd rather not let it adapt; the
  COST readout shows where it settled. Themes also read a smoothed musical
  "energy" signal, so they move differently in a song's calm and driving parts.
  Analysis is delayed to compensate for audio output latency, so beats land on
  the sound rather than ahead of it (with a BEAT SYNC offset for Bluetooth).
- **Synced lyrics** — lrclib.net lookup with filename analysis + confidence
  scoring, auto-search per track, .lrc import, and a manual "wrong lyrics?"
  search so a mismatched file can be corrected by picking the right song
  yourself. 20 line animations × 44 per-letter effects, drawn on a dedicated
  canvas layer.
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
- **Revoice (audio → MIDI → a new arrangement)** — reads the melody off a track,
  then rebuilds the song around it with FLUX's own sounds: lead, bass, chords and
  drums, in 5 styles (EDM / HOUSE / TRAP / LOFI / DNB), with per-part levels.
  Monophonic YIN pitch tracking in a Web Worker, so the accurate source is a
  separated vocal (derived by subtracting the instrumental from the original);
  the full mix works but follows whatever is loudest. The backing is built from
  the song itself — drums on the analyser's real beat grid, key detected from the
  melody's duration-weighted pitch content, a chord per bar from what the melody
  is actually doing, and everything bigger at the drops. All synthesised, no
  sample library to download. Exports **.mid** too, if you'd rather finish in a DAW.
- **Discover (online catalogues)** — search real catalogues from inside FLUX and
  add tracks straight to the library. No account, no subscription, no API key.
  Two sources, because neither covers the whole problem: **Apple** (the iTunes
  Search API) has essentially every song ever released by name but serves a
  30-second preview of each, and **Audius** has full-length tracks but only
  independent artists. Which matters depends on what you came for, so the
  trade-off is stated on the picker and on every row rather than decided for you.

  The bar a source has to clear is unusual and rules out almost everything: FLUX
  needs the *samples*, since the visualizer, FX rack, stem separation and Revoice
  all work from a decoded AudioBuffer. So a source must serve audio a page can
  `fetch()` — open CORS on the audio itself, not just on its JSON. Spotify's Web
  Playback SDK gives a page no access to samples at all; SoundCloud stopped
  issuing API keys years ago; Deezer's API answers a browser but sends no
  `access-control-allow-origin`; Apple's own charts feed sends no CORS headers
  either, which is why browsing here is built out of searches. Apple previews are
  AAC, which a browser built without proprietary codecs cannot decode, so
  playability is checked before import and explained rather than failing silently.

- **Artists** — the library groups by artist, taken from streamed metadata or
  parsed out of "Artist - Title" filenames, with search covering both.
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
                project3d (perspective projections), dropLayers (per-theme
                layers unlocked by drops),
                lyricRenderer + lyricFx (line animations and per-letter effects),
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
