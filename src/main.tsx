import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { refreshReady } from "./ai/client";
import { engine } from "./audio/engine";
import { wireAudio } from "./audio/wire";
import { wireRuntime } from "./flux/runtime";
import { useStore } from "./store/useStore";
import "./styles.css";

wireAudio();
wireRuntime();
// unlock AI surfaces if this browser already holds a key (BYOK, local only)
refreshReady();
import("./miniPlayer").then((m) => m.wireMiniPlayer());
// finish a Spotify redirect if we came back from one, and reflect any session
import("./spotify").then(async (m) => {
  await m.completeSpotifyAuth();
  useStore.setState({ spotifyReady: await m.spotifyConnected() });
});
// debug/test handle
(window as unknown as { __fluxStore: typeof useStore }).__fluxStore = useStore;
(window as unknown as { __fluxEngine: typeof engine }).__fluxEngine = engine;
// per-frame signals, clock and stage state are exposed as __fluxSig,
// __fluxClock and __fluxStage (see flux/signals.ts, flux/clock.ts,
// stage/engine.ts) so sync can be measured rather than eyeballed
// melody transcription + MIDI writer, for scripts/revoice-check.mjs
import("./audio/revoice").then((m) => {
  (window as unknown as { __fluxRevoice: unknown }).__fluxRevoice = m;
});
import("./audio/instruments").then((m) => {
  (window as unknown as { __fluxInstruments: unknown }).__fluxInstruments = m;
});
import("./audio/arrange").then((m) => {
  (window as unknown as { __fluxArrange: unknown }).__fluxArrange = m;
});
import("./lyrics").then((m) => {
  (window as unknown as { __fluxLyrics: unknown }).__fluxLyrics = m;
});
import("./audio/transport").then((m) => {
  (window as unknown as { __fluxPlayAt: unknown }).__fluxPlayAt = m.playAt;
});
// AI internals for the ai-smoke suite (same pattern as __flux / __fluxStore)
import("./ai/covers").then((m) => {
  (window as unknown as { __fluxAi: unknown }).__fluxAi = { sanitizeSvg: m.sanitizeSvg, loadCover: m.loadCover };
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: offline app shell.
//
// Not in the desktop shell: the build is already on disk there, so the worker
// would only add a second copy of every asset and a cache that can serve a
// stale one after an update.
if ("serviceWorker" in navigator && import.meta.env.PROD && !(window as any).__fluxDesktop) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// Discord Rich Presence, in the desktop shell only — a browser tab cannot open
// the local socket it needs. Does nothing at all until an application id is
// entered (see src/discordPresence.ts).
import("./discordPresence").then(({ startDiscordPresence }) => startDiscordPresence());
