import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadKey } from "./ai/client";
import { engine } from "./audio/engine";
import { wireAudio } from "./audio/wire";
import { startRenderLoop } from "./visualizer/engine";
import { applyAccentTheme } from "./theme";
import { useStore } from "./store/useStore";
import "./styles.css";

wireAudio();
startRenderLoop();
// unlock AI surfaces if this browser already holds a key (BYOK, local only)
loadKey().then((k) => useStore.setState({ aiReady: !!k }));
applyAccentTheme(useStore.getState().visCfg);
useStore.subscribe((s) => s.visCfg, applyAccentTheme);
// debug/test handle
(window as unknown as { __fluxStore: typeof useStore }).__fluxStore = useStore;
(window as unknown as { __fluxEngine: typeof engine }).__fluxEngine = engine;
// AI internals for the ai-smoke suite (same pattern as __flux / __fluxStore)
import("./ai/covers").then((m) => {
  (window as unknown as { __fluxAi: unknown }).__fluxAi = { sanitizeSvg: m.sanitizeSvg, loadCover: m.loadCover };
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: offline app shell
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
