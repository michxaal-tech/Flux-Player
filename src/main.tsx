import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { wireAudio } from "./audio/wire";
import { startRenderLoop } from "./visualizer/engine";
import "./styles.css";

wireAudio();
startRenderLoop();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: offline app shell
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
