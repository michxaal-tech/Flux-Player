// Every AI feature in one place. A feature is a prompt plus a declaration of
// what context it needs — the shared client, command schema and executor do
// the rest, so new features are written here as data, not as new plumbing.
import { askJson, askText, AiError } from "./client";
import { buildContext, FX_REFERENCE, VIS_REFERENCE, uniqueTracks } from "./context";
import type { CtxOpts } from "./context";
import { COMMAND_SPEC, executeCommand, isCommand } from "./commands";
import type { Command } from "./commands";
import { useStore } from "./../store/useStore";
import { saveCover } from "./covers";
import { speak } from "./speech";

const PERSONA = `You are FLUX COPILOT, the assistant built into the FLUX music player.
You are concise, a little bit of a music nerd, never corporate. Replies are one
or two short sentences — the user is looking at a player, not reading an essay.`;

/** Runs a prompt that returns the shared command schema, then executes it. */
export async function runCommand(
  userPrompt: string,
  opts: { ctx?: CtxOpts; extraSystem?: string; label?: string; maxTokens?: number } = {}
): Promise<Command & { notes: string[] }> {
  const system = [PERSONA, opts.extraSystem, COMMAND_SPEC].filter(Boolean).join("\n\n");
  const cmd = await askJson<Command>({
    system,
    user: `${buildContext(opts.ctx)}\n\n---\nUSER REQUEST: ${userPrompt}`,
    label: opts.label ?? "thinking",
    maxTokens: opts.maxTokens ?? 1500,
    validate: isCommand,
  });
  const { notes } = await executeCommand(cmd);
  return { ...cmd, notes };
}

// ── PHASE A ────────────────────────────────────────────────────────────────

/** 1. FLUX COPILOT — free-form control of the whole app. */
export async function copilot(message: string): Promise<void> {
  const push = (m: { role: "user" | "ai"; text: string; notes?: string[] }) =>
    useStore.setState((s) => ({ aiChat: [...s.aiChat, m].slice(-40) }));
  push({ role: "user", text: message });
  try {
    const r = await runCommand(message, {
      label: "copilot",
      ctx: { library: true, maxTracks: 200, stats: true },
      extraSystem: `The user may ask for anything: playing music, changing the sound,
restyling the visuals, building a playlist, setting a sleep timer. Prefer doing
the thing over asking clarifying questions — pick sensible choices and say what
you did. If the library is empty, say so instead of inventing tracks.`,
    });
    push({ role: "ai", text: r.reply, notes: r.notes });
  } catch (e) {
    push({ role: "ai", text: errText(e) });
  }
}

/** 2. VIBE TO FX — description → a named FX preset, applied live. */
export async function vibeToFx(vibe: string): Promise<string> {
  const r = await runCommand(`Design an FX chain for this vibe: "${vibe}"`, {
    label: "vibe → fx",
    ctx: { library: false, queue: false, visuals: false },
    extraSystem: `${FX_REFERENCE}

Return exactly one "fx" action with a short evocative uppercase name (max 18
chars) and every field you want to set. Think like a producer: pick values that
genuinely create the requested character, and don't be timid — if they ask for
underwater, actually roll the tone off hard.`,
  });
  return r.reply;
}

/** 3. VIBE TO VISUALS — description → theme + palette + tune settings. */
export async function vibeToVisuals(vibe: string): Promise<string> {
  const r = await runCommand(`Restyle the visualizer for: "${vibe}"`, {
    label: "vibe → visuals",
    ctx: { library: false, queue: false, fx: false },
    extraSystem: `${VIS_REFERENCE}

Return exactly one "visuals" action. Choose the theme whose actual look best
matches the request, then tune glow/trail/particles/intensity/colors to match.
Use a named palette when one fits; otherwise set palette CUSTOM with h1/h2.`,
  });
  return r.reply;
}

// 4. VOICE DJ lives in the UI layer: transcript → copilot().

// ── PHASE B: library intelligence ──────────────────────────────────────────

export interface TagProposal { trackId: string; name: string; tags: string[] }

/** 5. AUTO-TAG — proposals for review (nothing is applied until confirmed). */
export async function proposeTags(): Promise<TagProposal[]> {
  const lib = uniqueTracks(useStore.getState());
  if (!lib.length) return [];
  const r = await askJson<{ tags: TagProposal[] }>({
    system: `${PERSONA}\nYou tag a music library from filenames.`,
    user: `${buildContext({ library: true, maxTracks: 400, fx: false, visuals: false, queue: false })}

Assign 1-3 mood/energy tags to every track, inferring genre and feel from the
filename. Prefer these tags where they fit: HYPE, CHILL, FOCUS, SAD, WORKOUT,
NIGHT. Invent an extra tag only when none of those fit. Tags are UPPERCASE,
one word, max 14 chars.

Return {"tags": [{"trackId": "<id>", "name": "<track name>", "tags": ["X","Y"]}]}
covering every track listed above.`,
    label: "auto-tag",
    maxTokens: 4000,
  });
  const byId = new Map(lib.map((t) => [t.id, t]));
  return (r.tags ?? [])
    .filter((p) => p && byId.has(p.trackId) && Array.isArray(p.tags))
    .map((p) => ({
      trackId: p.trackId,
      name: byId.get(p.trackId)!.name,
      tags: p.tags.filter((t) => typeof t === "string").map((t) => t.toUpperCase().slice(0, 14)).slice(0, 3),
    }));
}

export function applyTagProposals(list: TagProposal[]): void {
  const up = useStore.getState().updateTrack;
  const lib = useStore.getState().playlists.flatMap((p) => p.tracks);
  for (const p of list) {
    const src = lib.find((t) => t.id === p.trackId);
    if (!src) continue;
    // copies of one file share a fileId — tag them all so views agree
    for (const t of lib.filter((t) => t.fileId === src.fileId)) up(t.id, { tags: p.tags });
  }
}

export interface GenreGroup { genre: string; trackIds: string[] }

/** 6. GENRE SORTER — proposed genre playlists for confirmation. */
export async function proposeGenres(): Promise<GenreGroup[]> {
  const r = await askJson<{ genres: GenreGroup[] }>({
    system: `${PERSONA}\nYou infer musical genre from track filenames.`,
    user: `${buildContext({ library: true, maxTracks: 400, fx: false, visuals: false, queue: false })}

Group the library into genre buckets (between 2 and 8 buckets; every track in
exactly one). Genre names are short and uppercase, e.g. HIP-HOP, HOUSE, ROCK,
AMBIENT. Skip a bucket that would hold a single track unless nothing else fits.

Return {"genres": [{"genre": "NAME", "trackIds": ["id", ...]}]}`,
    label: "genres",
    maxTokens: 3000,
  });
  return (r.genres ?? []).filter((g) => g && typeof g.genre === "string" && Array.isArray(g.trackIds));
}

/** 7. AI PLAYLIST — description → curated, ordered, named playlist. */
export async function aiPlaylist(description: string): Promise<string> {
  const r = await runCommand(`Build a playlist: "${description}"`, {
    label: "playlist",
    ctx: { library: true, maxTracks: 400, fx: false, visuals: false },
    extraSystem: `Return one "playlist" action. Pick only tracks that genuinely fit,
order them so the sequence flows (openers, peak, comedown), and give it an
evocative short name. Set activate=true. Aim for 8-20 tracks unless the library
is smaller. Mention in the reply why the picks fit.`,
  });
  return r.reply;
}

/** 8. DAILY MIX — time-of-day aware mix from tags and history. */
export async function dailyMix(): Promise<string> {
  const r = await runCommand("Build my daily mix for right now.", {
    label: "daily mix",
    ctx: { library: true, maxTracks: 400, fx: false, visuals: false, stats: true },
    extraSystem: `Return one "playlist" action named for the moment (e.g. "MONDAY
MORNING LIFT", "LATE NIGHT DRIFT"). Weigh the local time heavily: mellow early
and late, energetic midday and evening. Mix favourites and high-play tracks with
some that haven't been played recently. Set activate=true and play=true.`,
  });
  return r.reply;
}

/** 9. SMART SHUFFLE — reorder the current queue into an energy arc. */
export async function smartShuffle(): Promise<string> {
  const r = await runCommand("Reorder the current queue as an energy arc.", {
    label: "smart shuffle",
    ctx: { library: true, maxTracks: 400, fx: false, visuals: false },
    extraSystem: `Reorder the tracks currently in the playing queue (listed under
QUEUE ORDER) into warm-up → build → peak → cooldown using BPM and tags. Return
one "queue" action with mode "replace", the reordered trackIds, a playlistName
describing the arc, and play=false. Include only tracks already in that queue.`,
  });
  return r.reply;
}

/** 10. AI COVER ART — abstract neon SVG, sanitized before storage. */
export async function coverArt(
  kind: "track" | "playlist",
  id: string,
  subject: string
): Promise<boolean> {
  const svg = await askText({
    system: `You generate abstract album cover art as raw SVG.`,
    user: `Create a 400x400 SVG album cover for "${subject}".

Rules:
- Output ONLY the <svg>…</svg> source, no prose, no markdown fence.
- viewBox="0 0 400 400", no width/height attributes.
- Abstract and neon: gradients, glows (feGaussianBlur is allowed), geometric or
  organic shapes, layered translucency. Dark background.
- No text, no <script>, no <image>, no external references, no animation tags.
- Make it feel like the music the title suggests.`,
    label: "cover art",
    maxTokens: 2000,
  });
  return saveCover(kind, id, svg);
}

/** 11. EMOJI SEARCH — emoji query → matching track ids. */
export async function emojiSearch(emojis: string): Promise<string[]> {
  const r = await askJson<{ trackIds: string[] }>({
    system: `${PERSONA}\nYou match music to emoji.`,
    user: `${buildContext({ library: true, maxTracks: 400, fx: false, visuals: false, queue: false })}

The user searched with only these emoji: ${emojis}
Interpret the mood/genre/energy they imply and return the matching tracks,
best match first. Return {"trackIds": ["id", ...]} (empty array if nothing fits).`,
    label: "emoji search",
    maxTokens: 1200,
  });
  return Array.isArray(r.trackIds) ? r.trackIds.filter((x) => typeof x === "string") : [];
}

/** 12. BPM COACH — cadence target → progressive running playlist. */
export async function bpmCoach(targetBpm: number): Promise<string> {
  const r = await runCommand(`Build a running playlist for ${targetBpm} BPM cadence.`, {
    label: "bpm coach",
    ctx: { library: true, maxTracks: 400, fx: false, visuals: false },
    extraSystem: `Pick tracks whose BPM is within about 15 of ${targetBpm} (or half/
double that, which feels the same to a runner). Where BPM is unknown, infer from
the track name and tags. Order easiest to hardest so effort ramps up. Return one
"playlist" action named for the run, activate=true.`,
  });
  return r.reply;
}

// ── PHASE C: performance & atmosphere ──────────────────────────────────────

/** 13/14. RADIO HOST + HYPE MAN — one spoken line over the intro. */
export async function radioLine(mode: "host" | "hype", fromName: string, toName: string): Promise<void> {
  const style =
    mode === "host"
      ? `You are a late-night radio DJ: warm, unhurried, a little poetic. One
sentence, max 22 words.`
      : `You are a hype man at peak workout intensity: explosive, punchy, ALL
energy. One sentence, max 16 words, no profanity.`;
  const text = await askText({
    system: `${style}\nReply with only the spoken line — no quotes, no stage directions.`,
    user: `The track "${fromName || "the last one"}" just ended. Now playing "${toName}". Give the transition line.`,
    label: mode === "host" ? "radio host" : "hype man",
    maxTokens: 120,
  });
  await speak(text.replace(/^["']|["']$/g, ""), mode === "hype" ? { rate: 1.12, pitch: 1.1 } : { rate: 0.95, pitch: 0.95 });
}

/** 15. SLEEP STORY DJ — narration plus a gradual wind-down ramp. */
export async function sleepStory(minutes: number): Promise<string> {
  const r = await runCommand(`Start a ${minutes} minute wind-down for sleep.`, {
    label: "sleep story",
    ctx: { library: true, maxTracks: 200, visuals: false },
    extraSystem: `Return, in order:
1. a "say" action with 2-3 calm sentences easing the listener toward sleep,
2. an "fx" action starting the wind-down (speed ~0.9, vinyl true, reverb ~0.45,
   size ~4, treble around -5, tone ~7000, boost ~0.9),
3. a "sleepTimer" action for ${minutes} minutes.
Optionally a "playlist" action of the calmest tracks first. The app ramps the FX
further on its own as the timer runs.`,
  });
  startSleepRamp(minutes);
  return r.reply;
}

let sleepRamp: ReturnType<typeof setInterval> | null = null;
/** Gradually deepens the wind-down until the sleep timer fires. */
export function startSleepRamp(minutes: number): void {
  if (sleepRamp) clearInterval(sleepRamp);
  const t0 = Date.now();
  const total = minutes * 60000;
  sleepRamp = setInterval(() => {
    const s = useStore.getState();
    const k = Math.min(1, (Date.now() - t0) / total);
    if (k >= 1 || !s.sleepEnd) {
      if (sleepRamp) clearInterval(sleepRamp);
      sleepRamp = null;
      return;
    }
    useStore.setState({
      fx: {
        ...s.fx,
        speed: 0.92 - k * 0.1,
        vinyl: true,
        reverb: Math.min(0.8, 0.45 + k * 0.3),
        treble: -4 - k * 6,
        tone: 7000 - k * 4200,
        boost: 0.92 - k * 0.15,
      },
      activePreset: "WIND-DOWN",
    });
  }, 15000);
}

export function stopSleepRamp(): void {
  if (sleepRamp) clearInterval(sleepRamp);
  sleepRamp = null;
}

/** 16. MOOD CHECK-IN — one description sets FX + visuals + queue together. */
export async function moodCheckIn(mood: string): Promise<string> {
  const r = await runCommand(`My mood right now: "${mood}"`, {
    label: "mood",
    ctx: { library: true, maxTracks: 300, stats: true },
    extraSystem: `${FX_REFERENCE}\n\n${VIS_REFERENCE}

Respond to the mood with three actions together: an "fx" action, a "visuals"
action, and a "playlist" action (activate=true, play=true) chosen to suit it.
Match the feeling rather than always trying to cheer them up.`,
    maxTokens: 2000,
  });
  return r.reply;
}

/** 17. PRESET PACK GENERATOR — "5 phonk presets" → saved to the rack. */
export async function presetPack(request: string): Promise<string> {
  const r = await runCommand(`Generate a preset pack: "${request}"`, {
    label: "preset pack",
    ctx: { library: false, queue: false, visuals: false },
    extraSystem: `${FX_REFERENCE}

Return exactly one "preset" action containing the requested presets (default 5
if no count is given). Each needs a distinct short uppercase name and a full,
committed set of FX values — the presets in a pack should sound clearly
different from each other, not minor variations.`,
    maxTokens: 2500,
  });
  return r.reply;
}

/** 18. TIME MACHINE — era description → FX + visuals restyle. */
export async function timeMachine(era: string): Promise<string> {
  const r = await runCommand(`Take the player to: "${era}"`, {
    label: "time machine",
    ctx: { library: false, queue: false },
    extraSystem: `${FX_REFERENCE}\n\n${VIS_REFERENCE}

Return an "fx" action and a "visuals" action that together evoke that time and
place — the recording technology as much as the music (tape hiss, AM radio
bandwidth, vinyl crackle, hall reverb of a club). Name the FX preset after the
era. In the reply, mention one production detail you emulated.`,
    maxTokens: 1800,
  });
  return r.reply;
}

/** 19. DREAM SETLIST — festival set with time slots and rationale (text). */
export async function dreamSetlist(brief: string): Promise<string> {
  return askText({
    system: `${PERSONA}\nYou are a festival programmer building a set from the user's own library.`,
    user: `${buildContext({ library: true, maxTracks: 300, fx: false, visuals: false, queue: false })}

Brief: ${brief || "a headline festival set"}

Write the setlist as plain text: each line "HH:MM — TRACK NAME — one-line reason
for its placement". Cover roughly 60-90 minutes, real tracks from the library
only, with a short paragraph at the end on the pacing logic.`,
    label: "setlist",
    maxTokens: 1800,
  });
}

/** 20. STUDIO NOTES — per-track analysis; saves the note back to the track. */
export async function studioNotes(trackId: string): Promise<string> {
  const s = useStore.getState();
  const tr = s.playlists.flatMap((p) => p.tracks).find((t) => t.id === trackId);
  if (!tr) throw new AiError("Track not found", "other");
  const r = await runCommand(`Write studio notes for the track id=${tr.id} ("${tr.name}").`, {
    label: "studio notes",
    ctx: { library: true, maxTracks: 120, visuals: false },
    extraSystem: `${FX_REFERENCE}

Infer the likely genre and production character from the name, tags and BPM.
Return a "note" action for that track id whose note contains: inferred genre,
two concrete production observations, and one suggested FX treatment. Also
return an "fx" action implementing that suggested treatment, named for it.
Keep the note under 400 characters.`,
    maxTokens: 1500,
  });
  return r.reply;
}

// ── PHASE D: personality & play ────────────────────────────────────────────

/** 21. TASTE ROAST. */
export async function tasteRoast(): Promise<string> {
  return askText({
    system: `You are a merciless but genuinely funny music critic roasting someone's
library. Punch at the taste, never at the person. Keep it under 180 words. No
slurs, nothing cruel about identity or appearance.`,
    user: `${buildContext({ library: true, maxTracks: 250, fx: true, visuals: true, queue: false, stats: true })}

Roast this library, the play counts, and their current FX/visual settings.`,
    label: "roast",
    maxTokens: 700,
  });
}

/** 22. FLUX WRAPPED — structured recap, rendered to an image by the UI. */
export interface Wrapped {
  title: string;
  headline: string;
  stats: { label: string; value: string }[];
  topTracks: string[];
  personality: string;
}

export async function fluxWrapped(): Promise<Wrapped> {
  return askJson<Wrapped>({
    system: `${PERSONA}\nYou write a year-in-review card for a music player.`,
    user: `${buildContext({ library: true, maxTracks: 250, fx: true, visuals: true, queue: false, stats: true })}

Return {"title": "FLUX WRAPPED", "headline": "<punchy one-liner about their taste>",
"stats": [{"label": "...", "value": "..."}, ...4-5 entries derived from the real
numbers above], "topTracks": ["<up to 5 real track names>"],
"personality": "<2 sentence listener personality>"}`,
    label: "wrapped",
    maxTokens: 1200,
  });
}

/** 23. WEEKLY REWIND — insights plus a suggested playlist (applied). */
export async function weeklyRewind(): Promise<string> {
  const r = await runCommand("Give me my weekly rewind.", {
    label: "rewind",
    ctx: { library: true, maxTracks: 300, stats: true, visuals: false },
    extraSystem: `In the reply, give 2-3 observations about the week's listening
(what they returned to, what they abandoned, any pattern). Then return one
"playlist" action for next week that pushes gently on those patterns —
activate=false so it waits for them.`,
    maxTokens: 1600,
  });
  return r.reply;
}

/** 24. ALBUM CRITIC — pretentious review of a playlist, with a score. */
export async function albumCritic(playlistId: string): Promise<string> {
  const pl = useStore.getState().playlists.find((p) => p.id === playlistId);
  if (!pl) throw new AiError("Playlist not found", "other");
  return askText({
    system: `You are an insufferably pretentious music critic — dense metaphors,
unearned confidence, obscure references. Funny because it is over the top, never
mean-spirited. End with a score out of 10 (decimals encouraged).`,
    user: `Review this playlist as if it were an album:\n"${pl.name}"\n${pl.tracks.map((t, i) => `${i + 1}. ${t.name}${t.tags.length ? ` [${t.tags.join("/")}]` : ""}`).join("\n")}\n\nUnder 220 words.`,
    label: "critic",
    maxTokens: 800,
  });
}

/** 25. MUSIC TRIVIA — 3 questions about the user's own library. */
export interface TriviaQ { q: string; options: string[]; answer: number; note: string }

export async function musicTrivia(): Promise<TriviaQ[]> {
  const r = await askJson<{ questions: TriviaQ[] }>({
    system: `${PERSONA}\nYou write short music quizzes.`,
    user: `${buildContext({ library: true, maxTracks: 200, fx: false, visuals: false, queue: false, stats: true })}

Write 3 multiple-choice questions mixing this listener's own library (their play
counts, tags, favourites) with general music knowledge about the artists and
genres those tracks suggest. Four options each.

Return {"questions": [{"q": "...", "options": ["a","b","c","d"], "answer": <0-3>,
"note": "<one line explaining the answer>"}]}`,
    label: "trivia",
    maxTokens: 1500,
  });
  return (r.questions ?? [])
    .filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && typeof q.answer === "number")
    .slice(0, 3);
}

/** 26. TRACK DUEL — announcer-style verdict between two tracks. */
export async function trackDuel(idA: string, idB: string): Promise<string> {
  const lib = useStore.getState().playlists.flatMap((p) => p.tracks);
  const a = lib.find((t) => t.id === idA);
  const b = lib.find((t) => t.id === idB);
  if (!a || !b) throw new AiError("Pick two tracks first", "other");
  return askText({
    system: `You are a boxing ring announcer calling a head-to-head between two
tracks. Big energy, short punchy lines, then declare a winner and why. Under 150
words. Use the play counts, tags and favourite status as "form".`,
    user: `FIGHTER A: "${a.name}" — plays=${a.plays} tags=${a.tags.join("/") || "none"} ${a.fav ? "FAVOURITE" : ""}
FIGHTER B: "${b.name}" — plays=${b.plays} tags=${b.tags.join("/") || "none"} ${b.fav ? "FAVOURITE" : ""}`,
    label: "duel",
    maxTokens: 600,
  });
}

/** 27. TAKE NAMER — names a recording from the FX actions used during it. */
export async function nameTake(log: string[], secs: number): Promise<string> {
  const text = await askText({
    system: `You name recorded DJ takes. Reply with ONLY the name: 2-4 words,
uppercase, evocative, no quotes, no punctuation at the end.`,
    user: `A ${Math.round(secs)} second take was just recorded. Actions performed during it, in order:
${log.length ? log.join("\n") : "(no effects touched — a clean take)"}

Name it.`,
    label: "naming take",
    maxTokens: 40,
  });
  return text.trim().replace(/^["']|["']$/g, "").toUpperCase().slice(0, 40) || `TAKE ${Math.round(secs)}s`;
}

export function errText(e: unknown): string {
  if (e instanceof AiError) return `⚠ ${e.message}`;
  return `⚠ ${(e as Error)?.message ?? "Something went wrong"}`;
}
