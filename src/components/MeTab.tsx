import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LEVELS } from "../constants";
import { deleteTake, startRec, stopRec } from "../audio/recorder";
import { exportTrack } from "../audio/exporter";
import { getUrl } from "../store/blobStore";
import { getCurrentTrack, getFavCount, useStore } from "../store/useStore";
import type { Take } from "../types";
import { fmt } from "../utils";
import { miniPlayerSupported, openMiniPlayer } from "../miniPlayer";
import { AiSettings } from "./ai/AiSettings";
import { presenceAvailable } from "../discordPresence";
import { AiStudio } from "./ai/AiStudio";
import { Card, Chip, Loader, Switch } from "../ui/kit";
import { I } from "../ui/icons";
import { spring } from "../ui/motion";

function TakeRow({ take }: { take: Take }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getUrl(`take-${take.id}`).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [take.id]);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="track-row" style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 6px 6px 12px", borderRadius: 12 }}>
      <span style={{ color: "var(--accent)", display: "grid" }}>{take.kind === "video" ? <I.stage size={18} /> : <I.note size={18} />}</span>
      <a href={url ?? undefined} download={take.name} style={{ flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none", fontSize: 14, fontWeight: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: url ? 1 : 0.5 }}>{take.name}</a>
      <span className="mono faint" style={{ fontSize: 12 }}>{fmt(take.secs)}</span>
      <a href={url ?? undefined} download={take.name} className="icon-btn" aria-label={`Download ${take.name}`} style={{ width: 34, height: 34 }}><I.upload size={17} style={{ transform: "rotate(180deg)" }} /></a>
      <button className="icon-btn" aria-label={`Delete ${take.name}`} onClick={() => deleteTake(take.id)} style={{ width: 34, height: 34 }}><I.trash size={16} /></button>
    </motion.div>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div className="faint" style={{ fontSize: 13, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Stat({ n, label }: { n: ReactNode; label: string }) {
  return (
    <div>
      <div className="display" style={{ fontSize: 40 }}>{n}</div>
      <div className="eyebrow" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** You, your recordings, exports, the AI layer and playback preferences. */
export function MeTab() {
  const stats = useStore((s) => s.stats);
  const playlists = useStore((s) => s.playlists);
  const recState = useStore((s) => s.recState);
  const recTime = useStore((s) => s.recTime);
  const takes = useStore((s) => s.takes);
  const sleepEnd = useStore((s) => s.sleepEnd);
  const exporting = useStore((s) => s.exporting);
  const track = useStore(getCurrentTrack);
  const favCount = useStore(getFavCount);
  const set = useStore((s) => s.set);
  const aiReady = useStore((s) => s.aiReady);
  const miniPlayer = useStore((s) => s.miniPlayer);
  const discordAppId = useStore((s) => s.discordAppId);
  const [miniSupported] = useState(miniPlayerSupported);
  const miniStatus = useStore((s) => s.miniStatus);

  const minutes = Math.floor(stats.seconds / 60);
  let lvlIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (minutes >= LEVELS[i].min) lvlIdx = i;
  const nextLvl = LEVELS[lvlIdx + 1];
  const lvlProg = nextLvl ? (minutes - LEVELS[lvlIdx].min) / (nextLvl.min - LEVELS[lvlIdx].min) : 1;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const sleepLabel = sleepEnd ? `${Math.max(0, Math.floor((sleepEnd - Date.now()) / 60000))}m` : "";
  const top = playlists.flatMap((p) => p.tracks).filter((tr) => tr.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 3);
  const rec = recState !== "idle";
  const levelName = LEVELS[lvlIdx].name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  return (
    <div className="stagger" style={{ display: "grid", gap: 16 }}>
      <Card style={{ background: "linear-gradient(135deg, rgb(var(--accent-rgb) / 0.2), var(--surface) 60%)" }}>
        <div className="eyebrow">{greeting} · Level {lvlIdx + 1}</div>
        <div className="display" style={{ fontSize: 40, margin: "8px 0 18px" }}>{levelName}</div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap", marginBottom: 20 }}>
          <Stat n={stats.plays} label="Plays" />
          <Stat n={<>{minutes}<span style={{ fontSize: 18, color: "var(--text-3)" }}> min</span></>} label="Listened" />
          <Stat n={favCount} label="Liked" />
        </div>
        <div style={{ height: 6, borderRadius: 6, background: "var(--surface-3)", overflow: "hidden" }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(lvlProg * 100)}%` }} transition={spring.soft} style={{ height: "100%", background: "var(--accent)", borderRadius: 6 }} />
        </div>
        <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
          {nextLvl ? `${nextLvl.min - minutes} min to ${nextLvl.name.toLowerCase()}` : "Top level reached"}
        </div>
        {top.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Most played</div>
            {top.map((tr, i) => (
              <div key={tr.id} style={{ display: "flex", gap: 12, fontSize: 14, padding: "5px 0" }}>
                <span className="mono" style={{ color: "var(--accent)" }}>{i + 1}</span>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.name}</span>
                <span className="mono faint">{tr.plays}×</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Recorder"
        hint="Records everything you hear — effects, stutters, brakes, ambience — as a take you can download."
        right={rec && <span className="mono" style={{ color: "var(--danger)", fontSize: 13 }}>● {fmt(recTime)}</span>}
      >
        <button className="btn" onClick={rec ? stopRec : startRec} style={{ width: "100%", height: 48, background: rec ? "var(--danger)" : "var(--surface-2)", color: rec ? "#fff" : "var(--text)", borderColor: rec ? "transparent" : "var(--line)" }}>
          <motion.span animate={rec ? { opacity: [1, 0.3, 1] } : { opacity: 1 }} transition={rec ? { duration: 1.2, repeat: Infinity } : undefined} style={{ width: 10, height: 10, borderRadius: rec ? 2 : 10, background: rec ? "#fff" : "var(--danger)" }} />
          {rec ? "Stop & save take" : "Start recording"}
        </button>
        {takes.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 2 }}>
            <AnimatePresence initial={false}>{takes.map((t) => <TakeRow key={t.id} take={t} />)}</AnimatePresence>
          </div>
        )}
      </Card>

      <Card
        title="Export"
        hint={track
          ? <>Render “{track.name}” with {track.fxPin ? "its pinned effects" : "the current effects"} baked in — full length, no live recording. Speed changes export tape-style (pitch follows speed).</>
          : "Play a track to export it with its effects baked in."}
      >
        {exporting ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48, justifyContent: "center", borderRadius: 14, background: "rgb(var(--accent-rgb) / 0.12)", color: "var(--accent)" }}>
            <Loader size={16} /> <span className="mono" style={{ fontSize: 13 }}>{exporting}</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button className="btn" disabled={!track} onClick={() => track && exportTrack(track, "wav")} style={{ height: 48 }}>Export WAV</button>
            <button className="btn" disabled={!track} onClick={() => track && exportTrack(track, "mp3")} style={{ height: 48 }}>Export MP3</button>
          </div>
        )}
        <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>Finished exports appear with your takes above.</div>
      </Card>

      <div className="instrument">
        <AiSettings />
        {aiReady && <AiStudio />}
      </div>

      <Card title="Playback" style={{ display: "grid", gap: 18 }}>
        <Row
          label="Mini player"
          hint={miniSupported
            ? "A small always-on-top player when you leave Flux. Browsers only open it from a tap, so use Open now once if it doesn't appear on its own."
            : "This browser doesn't advertise a floating window. Try Open now anyway — audio keeps playing in the background either way, with lock-screen controls."}
        >
          {/* Always offered, even where support looks absent: detection can be
              wrong, and a button that reports why it failed beats no button. */}
          <Chip onClick={() => openMiniPlayer()}>Open now</Chip>
          <Switch label="Mini player" on={miniPlayer} onChange={(v) => set({ miniPlayer: v })} />
        </Row>
        {!!miniStatus && <div style={{ fontSize: 13, color: "var(--accent)", marginTop: -8 }}>{miniStatus}</div>}
        <Row label="Sleep timer" hint="Pauses playback when the time is up.">
          {[15, 30, 60].map((m) => <Chip key={m} onClick={() => set({ sleepEnd: Date.now() + m * 60000 })}>{m}m</Chip>)}
          {sleepEnd && <Chip on onClick={() => set({ sleepEnd: null })}>✕ {sleepLabel}</Chip>}
        </Row>
        <Row label="Keyboard shortcuts" hint="Press ? anywhere.">
          <Chip onClick={() => set({ shortcutsOpen: true })}>Show shortcuts</Chip>
        </Row>
      </Card>

      {/* Only in the desktop app. Rich Presence is a conversation with the
          Discord client over a local socket, which a browser tab cannot open —
          and a control that cannot work is worse than no control. */}
      {presenceAvailable() && (
        <Card
          title="Discord"
          hint={<>Shows what you're playing on your Discord profile. It needs an application ID: at discord.com/developers/applications create a New Application (its name is what people see) and copy the Application ID from General Information. It identifies a public app, not your account, so it isn't a secret.</>}
        >
          <input className="input mono" value={discordAppId} onChange={(e) => set({ discordAppId: e.target.value.trim() })} placeholder="Application ID (leave empty to turn it off)" spellCheck={false} style={{ maxWidth: 380 }} />
          <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
            {discordAppId
              ? "On. If nothing shows up, check Discord is running and that Settings → Activity Privacy → “Share your detected activities” is on."
              : "Off. Nothing is sent anywhere until an ID is entered."}
          </div>
        </Card>
      )}

      <div className="faint" style={{ fontSize: 13, lineHeight: 1.6, padding: "0 4px" }}>
        Your library, playlists, likes, tags, notes, pinned effects, presets, stats and takes are stored on this
        device and survive restarts. Install Flux from your browser menu to use it like a native app — it works offline.
      </div>
    </div>
  );
}
