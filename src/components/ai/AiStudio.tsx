// The AI hub in the ME tab: library intelligence, atmosphere and the fun
// stuff. Each feature is a thin launcher over src/ai/features.ts.
import { useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../../constants";
import {
  albumCritic, applyTagProposals, bpmCoach, dailyMix, dreamSetlist, errText, fluxWrapped,
  musicTrivia, moodCheckIn, presetPack, proposeGenres, proposeTags, smartShuffle, tasteRoast,
  timeMachine, trackDuel, weeklyRewind, sleepStory, aiPlaylist,
} from "../../ai/features";
import type { GenreGroup, TagProposal, TriviaQ, Wrapped } from "../../ai/features";
import { useStore } from "../../store/useStore";
import { uid } from "../../utils";
import { mix } from "../../theme";
import { Module } from "../ui";
import { AiAction, AiCard, AiPrompt, ResultText, Spark } from "./AiBits";
import { WrappedCard } from "./WrappedCard";

const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 7 } as const;

/** 5. AUTO-TAG with a review step. */
function AutoTag() {
  const [rows, setRows] = useState<TagProposal[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const busy = useStore((s) => s.aiBusy);

  const scan = async () => {
    setMsg("");
    try {
      const r = await proposeTags();
      if (!r.length) { setMsg("Nothing to tag — the library is empty."); return; }
      setRows(r);
      setOn(Object.fromEntries(r.map((p) => [p.trackId, true])));
    } catch (e) { setMsg(errText(e)); }
  };

  const apply = () => {
    const picked = (rows ?? []).filter((r) => on[r.trackId]);
    applyTagProposals(picked);
    setMsg(`✓ tagged ${picked.length} tracks`);
    setRows(null);
  };

  return (
    <AiCard title="AUTO-TAG LIBRARY">
      {!rows ? (
        <>
          <button onClick={scan} disabled={busy} style={btn(CYAN, busy)}>✦ SCAN LIBRARY</button>
          {!!msg && <ResultText text={msg} />}
        </>
      ) : (
        <>
          <div style={{ maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {rows.map((r) => (
              <label key={r.trackId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!on[r.trackId]} onChange={(e) => setOn((s) => ({ ...s, [r.trackId]: e.target.checked }))} />
                <span style={{ flex: 1, fontSize: 10.5, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontSize: 9, fontFamily: MONO, color: MAG }}>{r.tags.join(" ")}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={apply} style={btn(CYAN, false)}>APPLY {Object.values(on).filter(Boolean).length}</button>
            <button onClick={() => setRows(null)} style={btn("#888", false)}>CANCEL</button>
          </div>
        </>
      )}
    </AiCard>
  );
}

/** 6. GENRE SORTER with confirmation. */
function GenreSorter() {
  const [groups, setGroups] = useState<GenreGroup[] | null>(null);
  const [msg, setMsg] = useState("");
  const busy = useStore((s) => s.aiBusy);

  const build = () => {
    const s = useStore.getState();
    const lib = s.playlists.flatMap((p) => p.tracks);
    let made = 0;
    for (const g of groups ?? []) {
      const tracks = g.trackIds.map((id) => lib.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
      if (tracks.length < 1) continue;
      useStore.setState((st) => ({
        playlists: [...st.playlists, { id: uid(), name: g.genre.toUpperCase().slice(0, 24), tracks: tracks.map((t) => ({ ...t, id: uid() })) }],
      }));
      made++;
    }
    setMsg(`✓ created ${made} genre playlist${made === 1 ? "" : "s"}`);
    setGroups(null);
  };

  return (
    <AiCard title="GENRE SORTER">
      {!groups ? (
        <>
          <button
            onClick={async () => {
              setMsg("");
              try {
                const g = await proposeGenres();
                if (!g.length) { setMsg("Couldn't infer genres from these names."); return; }
                setGroups(g);
              } catch (e) { setMsg(errText(e)); }
            }}
            disabled={busy} style={btn(CYAN, busy)}
          >✦ INFER GENRES</button>
          {!!msg && <ResultText text={msg} />}
        </>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {groups.map((g) => (
              <div key={g.genre} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ color: MAG, fontFamily: MONO }}>{g.genre}</span> · {g.trackIds.length} tracks
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={build} style={btn(CYAN, false)}>CREATE PLAYLISTS</button>
            <button onClick={() => setGroups(null)} style={btn("#888", false)}>CANCEL</button>
          </div>
        </>
      )}
    </AiCard>
  );
}

/** 25. MUSIC TRIVIA — interactive quiz. */
function Trivia() {
  const [qs, setQs] = useState<TriviaQ[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState("");
  const busy = useStore((s) => s.aiBusy);
  const score = (qs ?? []).filter((q, i) => picked[i] === q.answer).length;
  const answered = Object.keys(picked).length;

  return (
    <AiCard title="MUSIC TRIVIA">
      {!qs ? (
        <>
          <button
            onClick={async () => {
              setMsg(""); setPicked({});
              try {
                const r = await musicTrivia();
                if (!r.length) { setMsg("Couldn't build a quiz from this library yet."); return; }
                setQs(r);
              } catch (e) { setMsg(errText(e)); }
            }}
            disabled={busy} style={btn(MAG, busy)}
          >✦ START QUIZ</button>
          {!!msg && <ResultText text={msg} />}
        </>
      ) : (
        <>
          {qs.map((q, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.45 }}>{i + 1}. {q.q}</div>
              {q.options.map((o, oi) => {
                const chosen = picked[i] === oi;
                const revealed = picked[i] !== undefined;
                const right = oi === q.answer;
                const c = revealed && right ? CYAN : revealed && chosen ? "#FF8B8B" : "rgba(255,255,255,0.6)";
                return (
                  <button
                    key={oi}
                    onClick={() => picked[i] === undefined && setPicked((s) => ({ ...s, [i]: oi }))}
                    style={{
                      textAlign: "left", padding: "7px 10px", borderRadius: 8, fontSize: 10.5, cursor: revealed ? "default" : "pointer",
                      background: revealed && right ? mix(CYAN, 12) : "rgba(255,255,255,0.03)",
                      border: `1px solid ${revealed && (right || chosen) ? mix(c, 40) : "rgba(255,255,255,0.08)"}`, color: c,
                    }}
                  >{o}</button>
                );
              })}
              {picked[i] !== undefined && <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{q.note}</div>}
            </div>
          ))}
          {answered === qs.length && (
            <div style={{ fontSize: 12, fontWeight: 700, color: CYAN, textAlign: "center" }}>{score} / {qs.length}</div>
          )}
          <button onClick={() => setQs(null)} style={btn("#888", false)}>DONE</button>
        </>
      )}
    </AiCard>
  );
}

/** 26. TRACK DUEL — pick two tracks. */
function TrackDuel() {
  const playlists = useStore((s) => s.playlists);
  const busy = useStore((s) => s.aiBusy);
  const tracks = playlists.flatMap((p) => p.tracks);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [out, setOut] = useState("");

  const sel = { ...selStyle };
  return (
    <AiCard title="TRACK DUEL">
      <select value={a} onChange={(e) => setA(e.target.value)} style={sel}>
        <option value="">fighter A…</option>
        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name.slice(0, 44)}</option>)}
      </select>
      <select value={b} onChange={(e) => setB(e.target.value)} style={sel}>
        <option value="">fighter B…</option>
        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name.slice(0, 44)}</option>)}
      </select>
      <button
        onClick={async () => {
          setOut("");
          try { setOut(await trackDuel(a, b)); } catch (e) { setOut(errText(e)); }
        }}
        disabled={busy || !a || !b || a === b} style={btn(MAG, busy || !a || !b || a === b)}
      >✦ FIGHT</button>
      {!!out && <ResultText text={out} />}
    </AiCard>
  );
}

/** 24. ALBUM CRITIC — pick a playlist. */
function Critic() {
  const playlists = useStore((s) => s.playlists);
  const busy = useStore((s) => s.aiBusy);
  const [pid, setPid] = useState("");
  const [out, setOut] = useState("");
  return (
    <AiCard title="ALBUM CRITIC">
      <select value={pid} onChange={(e) => setPid(e.target.value)} style={selStyle}>
        <option value="">choose a playlist…</option>
        {playlists.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.tracks.length})</option>)}
      </select>
      <button
        onClick={async () => {
          setOut("");
          try { setOut(await albumCritic(pid)); } catch (e) { setOut(errText(e)); }
        }}
        disabled={busy || !pid} style={btn(MAG, busy || !pid)}
      >✦ REVIEW IT</button>
      {!!out && <ResultText text={out} />}
    </AiCard>
  );
}

export function AiStudio() {
  const radioMode = useStore((s) => s.radioMode);
  const set = useStore((s) => s.set);
  const [wrapped, setWrapped] = useState<Wrapped | null>(null);
  const [wrapErr, setWrapErr] = useState("");

  return (
    <Module title="✦ AI STUDIO" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", fontFamily: MONO }}>BYOK</span>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        <AiCard title="MOOD CHECK-IN">
          <AiPrompt
            placeholder="how are you feeling?"
            cta="✦ TUNE ME"
            run={moodCheckIn}
            examples={["wired but exhausted", "melancholy sunday", "ready to run through a wall"]}
          />
        </AiCard>

        <div style={gridStyle}>
          <AiAction label="✦ DAILY MIX" hint="TIME-AWARE" run={dailyMix} />
          <AiAction label="✦ SMART SHUFFLE" hint="ENERGY ARC" run={smartShuffle} />
          <AiAction label="✦ WEEKLY REWIND" hint="INSIGHTS" run={weeklyRewind} />
          <AiAction label="✦ TASTE ROAST" hint="BRACE YOURSELF" run={tasteRoast} color={MAG} />
        </div>

        <AiCard title="AI PLAYLIST">
          <AiPrompt
            placeholder="describe the playlist you want…"
            cta="✦ BUILD"
            run={aiPlaylist}
            examples={["late night drive", "deep work, no vocals", "gym peak sets"]}
          />
        </AiCard>

        <AutoTag />
        <GenreSorter />

        <AiCard title="BPM COACH">
          <AiPrompt
            placeholder="target cadence, e.g. 170"
            cta="✦ BUILD RUN"
            run={(t) => bpmCoach(parseInt(t, 10) || 160)}
            examples={["150", "165", "180"]}
          />
        </AiCard>

        <AiCard title="TIME MACHINE">
          <AiPrompt
            placeholder="an era or a place…"
            cta="✦ TRAVEL"
            run={timeMachine}
            examples={["1998", "jazz bar in 1962", "2007 myspace emo", "80s mall"]}
          />
        </AiCard>

        <AiCard title="PRESET PACK">
          <AiPrompt
            placeholder="e.g. 5 phonk presets"
            cta="✦ GENERATE"
            run={presetPack}
            examples={["5 phonk presets", "4 vaporwave presets", "3 podcast voice presets"]}
          />
        </AiCard>

        <AiCard title="DREAM SETLIST">
          <AiPrompt
            placeholder="the set you'd play…"
            cta="✦ PROGRAM"
            run={dreamSetlist}
            multiline
            examples={["sunset festival slot", "3am warehouse"]}
          />
        </AiCard>

        <AiCard title="SLEEP STORY DJ">
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            Spoken wind-down plus a slow FX ramp that hands off to the sleep timer.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[20, 30, 45].map((m) => (
              <AiAction key={m} label={`✦ ${m}m`} run={() => sleepStory(m)} />
            ))}
          </div>
        </AiCard>

        <AiCard title="BETWEEN-TRACK VOICE">
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            Claude writes a line as each track starts and speaks it over the intro.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["off", "host", "hype"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ radioMode: m })}
                style={{
                  flex: 1, padding: "9px 6px", borderRadius: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  cursor: "pointer", textAlign: "center",
                  background: radioMode === m ? mix(m === "hype" ? MAG : CYAN, 18) : "rgba(255,255,255,0.04)",
                  border: `1px solid ${radioMode === m ? mix(m === "hype" ? MAG : CYAN, 45) : "rgba(255,255,255,0.08)"}`,
                  color: radioMode === m ? (m === "hype" ? MAG : CYAN) : "rgba(255,255,255,0.6)",
                }}
              >{m === "off" ? "✕ OFF" : m === "host" ? "📻 RADIO HOST" : "🔥 HYPE MAN"}</button>
            ))}
          </div>
        </AiCard>

        <Critic />
        <Trivia />
        <TrackDuel />

        <AiCard title="FLUX WRAPPED">
          <button
            onClick={async () => {
              setWrapErr("");
              try { setWrapped(await fluxWrapped()); } catch (e) { setWrapErr(errText(e)); }
            }}
            style={btn(MAG, false)}
          >✦ GENERATE MY WRAPPED</button>
          {!!wrapErr && <ResultText text={wrapErr} />}
          {wrapped && <WrappedCard data={wrapped} onClose={() => setWrapped(null)} />}
        </AiCard>

        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <Spark size={10} />
          <span>Every one of these runs against your own Anthropic key, straight from this browser.</span>
        </div>
      </div>
    </Module>
  );
}

const btn = (color: string, disabled: boolean) => ({
  padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
  cursor: disabled ? "wait" : "pointer", background: mix(color, 12),
  border: `1px solid ${mix(color, 38)}`, color, opacity: disabled ? 0.5 : 1, flex: 1,
} as const);

const selStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 9,
  padding: "9px 10px", fontSize: 11, color: "#fff", outline: "none",
} as const;
