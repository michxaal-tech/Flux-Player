import type { CapacitorConfig } from "@capacitor/cli";

// FLUX Player as a native Android shell. The web build in `dist/` is loaded
// straight from the APK's assets — no server, no network round-trip for the
// UI — which is why vite.config.ts uses a relative `base: "./"`.
const config: CapacitorConfig = {
  appId: "tech.michxaal.fluxplayer",
  appName: "FLUX Player",
  webDir: "dist",
  android: {
    // Chromium mixed-content default blocks http:// media inside an https://
    // origin. The app talks to APIs over https, but user-entered stream URLs
    // and the local file scheme need to coexist, so allow the mix explicitly.
    allowMixedContent: true,
  },
  plugins: {
    // Keep the OS splash brief; the app paints its own loading state.
    SplashScreen: { launchShowDuration: 0 },
  },
};

export default config;
