import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base so the build works at the domain root and on
  // sub-path hosting like GitHub Pages (/Flux-Player/)
  base: "./",
  plugins: [react()],
  server: { host: true },
  build: { chunkSizeWarningLimit: 900 },
});
