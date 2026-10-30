// Search.
//
// One field for everything. While it's empty the placeholder rolls through a
// few things you could type. Typing answers instantly from the library —
// results re-flow as the query narrows, rows sliding to their new places
// rather than blinking — and, after a short pause, asks the online catalogues
// too, which arrive with their own loading state underneath.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { artistOf, getArtists, useStore } from "../store/useStore";
import type { Track } from "../types";
import { I } from "./icons";
import { EmptyState, Segmented } from "./kit";
import { ease, spring } from "./motion";
import { TrackRow, titleCase } from "./Library";
import { Artwork } from "./Artwork";
import { Discover } from "../components/Discover";
import { YouTubeTab } from "../components/YouTubeTab";
import { SpotifyImport } from "../components/SpotifyImport";

const HINTS = ["an artist", "a song title", "a mood tag like #night", "a playlist", "something to discover"];

function RollingPlaceholder({ hidden }: { hidden: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((k) => (k + 1) % HINTS.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-hidden style={{ position: "absolute", left: 58, top: 0, bottom: 0, display: "flex", alignItems: "center", pointerEvents: "none", color: "var(--text-3)", opacity: hidden ? 0 : 1, transition: "opacity var(--t2)" }}>
      <span>Search for&nbsp;</span>
      <span style={{ position: "relative", overflow: "hidden", display: "inline-block", height: "1.3em" }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={i}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ duration: 0.45, ease: ease.out }}
            style={{ display: "inline-block", whiteSpace: "nowrap" }}
          >{HINTS[i]}</motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

export function Search() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [online, setOnline] = useState<"catalogues" | "youtube" | "spotify">("catalogues");
  const playlists = useStore((s) => s.playlists);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 550);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { input.current?.focus(); }, []);

  const qq = q.trim().toLowerCase();
  const res = useMemo(() => {
    if (!qq) return null;
    const tag = qq.startsWith("#") ? qq.slice(1).toUpperCase() : "";
    const tracks: { tr: Track; plId: string; idx: number; score: number }[] = [];
    for (const p of playlists) p.tracks.forEach((tr, idx) => {
      const name = tr.name.toLowerCase(), artist = (artistOf(tr) ?? "").toLowerCase();
      let score = 0;
      if (tag) { if (tr.tags.includes(tag)) score = 1; }
      else {
        if (name.startsWith(qq)) score += 3;
        else if (name.includes(qq)) score += 2;
        if (artist.startsWith(qq)) score += 2.5;
        else if (artist.includes(qq)) score += 1.5;
        if (tr.note?.toLowerCase().includes(qq)) score += 0.5;
      }
      if (score) tracks.push({ tr, plId: p.id, idx, score: score + Math.min(1, (tr.plays || 0) / 20) * 0.3 });
    });
    tracks.sort((a, b) => b.score - a.score);
    const pls = tag ? [] : playlists.filter((p) => p.name.toLowerCase().includes(qq));
    const artists = tag ? [] : getArtists(playlists).filter((a) => a.name.toLowerCase().includes(qq)).slice(0, 8);
    return { tracks: tracks.slice(0, 40), pls, artists };
  }, [qq, playlists]);

  const nothing = res && !res.tracks.length && !res.pls.length && !res.artists.length;
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ease.out }}
        style={{ position: "relative" }}
      >
        <I.search size={24} style={{ position: "absolute", left: 20, top: 22, color: q ? "var(--accent)" : "var(--text-3)", transition: "color var(--t3)" }} />
        <input
          ref={input}
          data-search-input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          aria-label="Search library and online sources"
          style={{
            width: "100%", height: 68, padding: "0 56px 0 58px", borderRadius: 22, border: "1px solid var(--line)",
            background: "var(--surface)", fontSize: 22, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "-0.01em",
            transition: "border-color var(--t3), background-color var(--t3), box-shadow var(--t3)",
            boxShadow: q ? "0 0 0 4px rgb(var(--accent-rgb) / 0.12)" : "none",
          }}
        />
        <RollingPlaceholder hidden={!!q} />
        <AnimatePresence>
          {q && (
            <motion.button
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={spring.pop}
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => { setQ(""); input.current?.focus(); }}
              style={{ position: "absolute", right: 14, top: 14 }}
            ><I.close size={20} /></motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {res && (
            <motion.section key="local" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: ease.out }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>In your library</div>
              {nothing ? (
                <div className="muted" style={{ padding: "8px 2px 4px" }}>Nothing in your library matches “{q.trim()}”. Try the online sources below.</div>
              ) : (
                <div style={{ display: "grid", gap: 20 }}>
                  {(res.pls.length > 0 || res.artists.length > 0) && (
                    <div className="hscroll" style={{ display: "flex", gap: 14, paddingBottom: 4 }}>
                      {res.pls.map((p) => (
                        <motion.button layout key={p.id} className="btn" onClick={() => useStore.setState({ view: "library", viewMode: { type: "pl", id: p.id }, libOpen: p.id })} style={{ height: 46 }}>
                          <I.playlist size={17} /> {titleCase(p.name)}
                        </motion.button>
                      ))}
                      {res.artists.map((a) => {
                        const first = playlists.flatMap((p) => p.tracks).find((t) => artistOf(t) === a.name) ?? null;
                        return (
                          <motion.div layout key={a.name} className="btn" style={{ height: 46, paddingLeft: 6 }}>
                            <span style={{ width: 34 }}><Artwork track={first} radius={999} /></span> {a.name}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                  <div>
                    <AnimatePresence initial={false}>
                      {res.tracks.map((e) => (
                        <motion.div
                          key={e.tr.id}
                          layout="position"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
                          transition={spring.slide}
                        >
                          <TrackRow track={e.tr} plId={e.plId} idx={e.idx} showSource={playlists.length > 1} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        <motion.section layout transition={spring.soft}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="eyebrow">Online</div>
            <Segmented
              size="sm"
              label="Online source"
              value={online}
              onChange={setOnline}
              options={[{ id: "catalogues", label: "Catalogues" }, { id: "youtube", label: "YouTube" }, { id: "spotify", label: "Spotify link" }]}
            />
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={online}
              className="instrument"
              initial={{ opacity: 0, y: 16, clipPath: "inset(0 0 40% 0 round 22px)" }}
              animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0 round 22px)" }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
              transition={{ duration: 0.5, ease: ease.out }}
            >
              {online === "catalogues" && <Discover query={debounced} defaultOpen />}
              {online === "youtube" && <YouTubeTab />}
              {online === "spotify" && <SpotifyImport />}
            </motion.div>
          </AnimatePresence>
        </motion.section>
      </LayoutGroup>
      {!res && !playlists.some((p) => p.tracks.length) && (
        <EmptyState title="Find something to play" body="Search the free catalogues above — Internet Archive, Audius, Apple previews — or paste a Spotify link to rebuild a playlist here." />
      )}
    </div>
  );
}
