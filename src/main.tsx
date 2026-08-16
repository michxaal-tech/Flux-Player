import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { wireAudio } from "./audio/wire";
import { startRenderLoop } from "./visualizer/engine";
import { applyAccentTheme } from "./theme";
import { useStore } from "./store/useStore";
import "./styles.css";

wireAudio();
startRenderLoop();
applyAccentTheme(useStore.getState().visCfg);
useStore.subscribe((s) => s.visCfg, applyAccentTheme);

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
