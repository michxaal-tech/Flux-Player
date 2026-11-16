# Flux

A local music player that makes music visible. Seven music-reactive stages,
lyrics that follow the singer word by word, a live Web Audio FX rack and a DJ
deck — all in the browser, and your audio never leaves the device.

## The idea

Flux is a warm ink room lit by the record that's playing. The interface takes
one accent at a time from the sleeve, type does most of the work (Bricolage
Grotesque, whose width and weight axes the titles actually animate through),
and depth comes from light and shadow rather than frosted panels. Behind
everything runs the **stage** — the visualizer — dimmed and calmed into a
backdrop while you browse, full brightness when you step into it.

Motion is part of the identity, with three families that each have a job:
**springs** for anything a hand touches (they retarget mid-flight, so a second
click bends the motion instead of restarting it), **glides** for what the
system moves (views, panels — long decisive deceleration, no bounce), and
**reveals** for content arriving (masks and clip paths that uncover from an
origin). Signature moments:

- **The sleeve stack** — changing track slides the cover out the way you went
  and the next one in from the other side, tilted like flipping records; the
  title re-sets letter by letter from condensed to full width; the accent, the
  stage and the waveform all glide to the new record's colour together. You can
  also throw the sleeve sideways to skip.
- **The Flux line** — the scrubber is the track's own waveform. A lens swells
  the bars under the pointer, dragging follows the hand exactly, and on release
  the playhead springs to the new spot with a ring where it landed.
- **The morphing play button** — one shape whose vertices travel between
  triangle and bars on a spring; a halo outside it breathes with the music.
- **The aperture** — entering the stage opens a ring from the button you pressed
  while the interface recedes and the scene comes forward.
- **Shared elements** — the dock artwork *is* the Listen artwork, and a
  playlist's collage *is* its page header; both morph between places.

Interface motion and music motion are separate systems: nothing in the UI waits
for the visualizer, and controls and text never move with the music. **Studio →
Motion** offers Full / Calm / Minimal interface motion (Minimal also follows the
system reduced-motion setting), independent of the stage's own intensity.

## Platforms

| Platform | How | 
| --- | --- |
| Web / PWA | `npm run build`, host `dist/` anywhere (installable, works offline) |
| macOS app | **Desktop build (macOS)** workflow → `.dmg` for Apple Silicon and Intel on the `desktop-latest` release. Native window chrome: no title bar, traffic lights over the rail. By hand, on a Mac: `npm run build && mkdir -p desktop/app && cp -R dist/* desktop/app/ && cd desktop && npm install && npm run dist:mac` |
| Windows app | **Desktop build (Windows)** workflow → installer + portable `.exe` |
| iPhone / iPad (Xcode) | `ios/` is a Capacitor Xcode project. On a Mac: `npm install && npm run ios:sync && npm run ios:open`, pick your team under Signing, run on a device. Background audio is enabled. The same project can target the Mac from Xcode (Designed for iPad / Mac Catalyst). |
| Android | **Android build (APK)** workflow |

The Mac build is ad-hoc signed, not notarised (that needs an Apple Developer
ID — see the notes at the bottom of `.github/workflows/mac.yml`). First launch:
right-click the app → Open.

## Visualizers

The stage (`src/stage/`) is a self-contained module behind a small interface,
and is being redesigned from scratch. [`docs/VISUALIZER_BRIEF.md`](docs/VISUALIZER_BRIEF.md)
is the complete brief: what it owns, what it is given each frame, and the
rules it has to keep (honest beat tracking, performance, offline). Outside the
immersive stage and the Studio preview, the interface is lit by the **aura** —
soft colour taken from the playing record — so it never depends on which
visualizer is installed.

## Run it

```bash
npm install
npm run dev        # dev server
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
node scripts/smoke.mjs   # headless end-to-end smoke test (after build)
npm run sync             # beat + lyric timing against a track with known kicks (after build)
npm run spotify          # Spotify import, network stubbed (after build)
npm run spotify:live     # same, against the live service — needs the internet
npm run discover         # Internet Archive source, network stubbed (after build)
npm run catalogue        # every Discover source, against the live services
npm run deepbeats        # the beat tracker against pulses with known times (no browser)
npm run deep             # deep vs fast analysis on real audio, error in ms
```

## Desktop build

`desktop/` is a window around the same build the web version ships — not a
second implementation, so a fix lands in both. What it adds:

- **Chromium's GPU flags.** `ignore-gpu-blocklist` and `enable-gpu-rasterization`.
  Chromium blocklists GPU rasterisation on a lot of ordinary laptop graphics
  drivers — so on the machines most likely to stutter, the browser would
  otherwise draw the interface and the canvas-based stage modes on the CPU and
  cannot be argued out of it.
- **No service worker.** The build is already on disk, so an offline cache
  could only ever serve a stale copy of it.

It loads the build over a `flux://` scheme of its own rather than `file://`,
which would render the markup and break IndexedDB — where the library lives —
along with workers and every secure-context API.

It also carries **Discord Rich Presence**, which is desktop-only for the same
reason: it is an IPC conversation over a local socket, and a browser tab cannot
open one. `desktop/discord.cjs` speaks the protocol directly — a 4-byte opcode,
a 4-byte length and that much JSON — rather than depending on a library for it.
It needs a Discord application ID, entered under Settings → DISCORD; there is no
shared one to ship, because the name Discord displays is that application's.

The **Desktop build (Windows)** workflow builds it on GitHub's runners and
attaches the installer to the `desktop-latest` release, so it needs no
toolchain locally. To build it by hand instead:

```bash
npm run build
mkdir -p desktop/app && cp -r dist/* desktop/app/
cd desktop && npm install && npm start      # or: npx electron-builder --win
```

## Features

- **Player** — drag-and-drop or file-picker import (title/artist read from
  the file's tags), decoded waveform seekbar,
  A-B loop, shuffle/repeat, crossfaded track switching, favorites/tags/notes,
  per-track pinned FX, up-next queue, session stats + listener levels.
- **FX rack** — speed with tape mode (pitch-follow), convolution reverb, echo,
  3-band EQ, 8D auto-pan, vinyl crackle, bit-crush drive, tone/highpass filters,
  vocal cut (mid-side cancel), output boost — plus 11 factory presets, saveable
  user presets, and a chaos randomizer. Ambience generators (rain / fireplace /
  wind) are synthesized in the audio graph, no samples.
- **DJ deck** — live BPM detection, output meter, 4 hot cues, hold-to-stutter
  (⅛/¼/½), tape brake & spin-up, speed nudge.
- **The stage** — seven modes, each its own composition and movement
  language, rendered on WebGL2 (canvas 2D for the graphic ones) and composited
  through one pass that handles grading, grain and the transitions between
  modes: a noise-shaped reveal that grows from the centre with a glowing front,
  both scenes drifting in scale, so a switch reads as moving *through* rather
  than cutting. Colours glide between palettes rather than jumping.

  | Mode | Composition | What the music does |
  | --- | --- | --- |
  | Veil | curtains of light over a dark horizon | bass lifts the hems, highs shimmer, beats climb the folds |
  | Ink | pigment folding through water (marbling) | energy deepens the fold, bass swells, hits drop ripples |
  | Caustic | refracted light on the floor of a pool | bass bulges the surface, beats pull the light into focus, highs split colour |
  | Orbit | an orrery seen from above | beats tick the bodies forward like an escapement, bars release coronas |
  | Signal | a Swiss poster that rearranges itself | bars turn the shapes, a cell counts the beat, bass swells the discs |
  | Ridge | the spectrum as hills receding into fog | loudness raises peaks, time carries them back, beats rim the front ridge |
  | Words | the lyrics set as the picture | sung words light, bass stretches the active word, lines rise and lift away |

  Every mode has two named dials and nine curated looks start from them. Quiet
  passages keep a slow self-motion ("quiet breathing"); the paused stage drops
  to 30fps. Adding a mode: write a `ModeDef` in `src/stage/modes/`, list it in
  `modes/index.ts` and `src/stage/modeIds.ts`.

- **Synchronisation** — one playback clock (`src/flux/clock.ts`) answers
  "where in the song are we, *as heard*": it interpolates the element's coarse
  `currentTime`, subtracts the output latency (scaled by playback rate) plus a
  user offset for Bluetooth, holds still while paused or buffering, and marks
  every seek, loop, track change and repeat as a new epoch so nothing fires the
  beats it skipped. The stage, the lyrics and the scrubber all read it.

  The signals layer (`src/flux/signals.ts`) keeps measured and inferred things
  apart: **level, frequency bands and transients** are measured from the
  analyser (delayed to match the speakers); **tempo and beat phase** are
  inferred, so they carry a **confidence**. The beat comes from the offline
  analysis (a beat grid fitted over the whole file in a worker), checked section
  by section against real onsets — a grid that runs on through a silent intro or
  a beatless breakdown loses its confidence there. Before the analysis lands a
  live autocorrelation tracker stands in, capped at lower confidence. Below the
  threshold nothing snaps to a beat: the stage follows energy and real
  transients instead (Studio → Intensity → Rhythm: Auto / Beat / Energy, with a
  live confidence readout). `npm run sync` measures it: on a 120bpm test track
  beats land with ≈10ms median error, none fire in the beatless intro or on a
  pulseless track, and timing holds through seeks, pause/resume, 1.25× playback,
  track changes and repeat.

- **Lyrics** — read from the file first (ID3 SYLT/USLT, Vorbis, MP4), then
  lrclib.net, or a manual search, an attached .lrc, or (with an AI key)
  transcription. Rendered as real DOM text driven per frame from the clock: the
  column glides to the active line on a spring, distant lines soften, a long
  instrumental gap shows a countdown toward the next line, and hand-scrolling
  pauses the follow. **Word timing is used only when it exists** — enhanced LRC
  `<mm:ss.xx>` tags, karaoke SYLT (syllables grouped into lines) and word-level
  Whisper timestamps — and fills each word as it is sung; otherwise the line
  lights as a whole, and untimed text is shown as a static page marked as such.
  Click a line to seek. Size, alignment, highlight style, stage contrast and a
  timing offset live in Studio → Lyrics. (Flux has no animated mouth or
  character, so there is no lip-sync feature.)

- **Studio** — Looks (curated + your own: save, rename, duplicate, update,
  delete), Style, Colour (follow the artwork or a palette, warmth, vividness),
  Motion, Intensity, Lyrics, Interface (Ink / Night / Paper themes, accent,
  backdrop strength, rendering quality). Previews are rendered by the stage
  itself in the real colours; every section resets on its own.

- **Artwork** — embedded covers (ID3 APIC, FLAC PICTURE, MP4 covr), catalogue
  art and YouTube thumbnails; tracks with none get a generated sleeve stable for
  that track. The palette for the interface and the stage is taken from it.

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
  Three sources, because none covers the whole problem: **Apple** (the iTunes
  Search API) has essentially every song ever released by name but serves a
  30-second preview of each; the **Internet Archive** has millions of
  full-length recordings — taper-approved live sets and pre-1960 masters, free
  and legal — but not chart pop; and **Audius** has full-length tracks from
  independent artists. Which matters depends on what you came for, so the
  trade-off is stated on the picker and on every row rather than decided for you.

  The Archive needs two calls rather than one, because its search is
  item-level: a hit is a whole concert or record, so the file list comes from a
  second request per item and those run together. Free-text search there matches
  descriptions, so "radiohead" returns jam bands who merely mention them —
  scoping the query to creator and title turns that into real Radiohead
  recordings, or an honest nothing. Browse chips point at the corners worth
  arriving at (the Live Music Archive, the Great 78 Project, netlabels, and a
  Hyperpop chip that leads with the handful of releases actually tagged as such
  before filling out with the sounds either side of it) rather than throwing
  genre words at all 12 million items. Every chip names a collection, which is
  also what keeps the results honest: the Archive takes uploads from anyone, so
  a bare subject search for a modern genre surfaces bootlegged commercial albums
  first, and the item's own licence tag can't sort that out — whoever uploads
  picks it, and the bootlegs claim Creative Commons too.

  **FULL TRACKS ONLY** is on by default, so a tap can't put a 30-second excerpt
  in the library by mistake. Switch it off and excerpts come back labelled
  EXCERPT; a source that serves nothing else says so and offers the toggle
  rather than showing an empty page.

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

- **Spotify import** — paste any Spotify link (song, album or playlist) and FLUX
  rebuilds it here, with **no account, no app registration and no key**. Tracks
  already on the device are used at full length; the rest come in as Spotify's
  own 30-second preview clips, and anything with no clip is looked up on Apple
  instead — so a playlist arrives playable rather than as a shopping list. The
  clips are plain unencrypted MP3 on `p.scdn.co` with
  `access-control-allow-origin: *`, the same excerpts the embed player hands any
  page on the web; Spotify's actual streams are DRM-protected and are not
  touched. Reading the track list needs one workaround, because every path under
  `open.spotify.com` except `/oembed` refuses a cross-origin read: the list lives
  in the `__NEXT_DATA__` of the public embed page, so a reader service fetches
  that page and answers with CORS open, with a second reader and then Spotify's
  own keyless oEmbed behind it. Only the link is ever sent, and it is public by
  definition. Connecting a Spotify app is still offered but now optional — it
  adds only what a public link can't reach, private playlists and Liked Songs.
  Two checks cover it, because everything it leans on lives outside this repo:
  `npm run spotify` drives the whole import with the network stubbed, and
  `npm run spotify:live` asserts each leg of the live service separately, so a
  failure names which one moved.

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
  flux/         clock (shared playback time), signals (bands, transients,
                tempo + confidence), look model + presets + migration, artwork,
                tags, lyric timing, runtime wiring (analysis, accent)
  stage/        the visualizer: engine (WebGL2 compositor, quality governor,
                thumbnails), glsl, modes/ — one file per mode
  ui/           the interface: shell pieces, Listen, Library, Queue, Search,
                Studio, Lyrics, scrubber, transport, kit (motion primitives)
  components/   the instrument panels (FX rack, deck, Revoice, sources,
                settings, AI) — dense tools set into the new UI on a dark surface
  audio/        engine (Web Audio graph), transport, analysis worker, recorder,
                peaks, offline FX render + encoders, stems, Revoice
  store/        zustand store (persisted, migrated) + blob storage
  hooks/        keyboard, media session, sleep timer
```

Saved settings from the previous visualizer migrate automatically: each old
theme opens on the closest mode, palettes map to the nearest palette, the sync
offset carries over, and saved looks become personal presets.

## Optional AI layer (BYOK)

FLUX works completely without AI. Add an API key in **Settings → AI SETTINGS** and a
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
