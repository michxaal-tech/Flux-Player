// Does the desktop shell actually come up?
//
// Packaging succeeding proves nothing about whether the window loads: the
// custom `flux://` scheme, the preload bridge and the relative asset paths in
// the build are all only exercised at runtime. So this boots the real shell
// under a virtual display, waits for the app to render, and checks the three
// things that would each leave a black window:
//
//   - the page loaded over flux:// at all
//   - the preload ran, so the desktop pixel ceiling is actually raised
//   - React mounted and the stage's render loop is running
//
// Usage: xvfb-run -a node launch-check.cjs
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

require("./main.cjs");

const FAIL = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) FAIL.push(name);
};

// A hang is a failure, not a reason to sit there: if the protocol handler
// never answers, `did-finish-load` simply never fires.
const deadline = setTimeout(() => {
  console.log("  ✗ timed out before the window finished loading");
  app.exit(1);
}, 45000);
deadline.unref?.();

app.whenReady().then(async () => {
  // main.cjs opened the window; wait for it to finish loading
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log("  ✗ no window was created");
    app.exit(1);
    return;
  }
  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    // Electron prints its own Content-Security-Policy advice when a page has
    // no CSP, and says in the same breath that it stops once the app is
    // packaged — it is a note to the developer, not something the page did.
    if (level >= 2 && !message.includes("Electron Security Warning")) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    errors.push(`did-fail-load ${code} ${desc} ${url}`);
  });

  await new Promise((r) => {
    if (!win.webContents.isLoading()) return r();
    win.webContents.once("did-finish-load", r);
  });
  // give React and the render loop a moment to mount and run
  await new Promise((r) => setTimeout(r, 4000));

  const probe = await win.webContents.executeJavaScript(`(() => ({
    href: location.href,
    desktop: window.__fluxDesktop === true,
    navs: document.querySelectorAll("nav[aria-label=Main] button").length,
    canvases: document.querySelectorAll("canvas").length,
    // the stage reports the mode it is drawing once its loop has run
    loop: !!(window.__fluxStage && window.__fluxStage.mode && !window.__fluxStage.error),
    stageError: window.__fluxStage ? window.__fluxStage.error : "no stage",
  }))()`);

  check("loads over flux://", probe.href.startsWith("flux://app/"), probe.href);
  check("preload bridge reached the page", probe.desktop);
  check("the app mounted", probe.navs >= 3 && probe.canvases >= 1,
    `${probe.navs} nav buttons, ${probe.canvases} canvases`);
  check("the render loop is running", probe.loop, probe.stageError || "");

  // Is the window actually painting? Counting the engine's own `vt` does not
  // answer that — it only advances while the fullscreen visualizer is open,
  // so it reads zero on a freshly launched app whatever the renderer is doing.
  // Count animation frames in the page instead.
  const fps = await win.webContents.executeJavaScript(`new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : res(n); };
    requestAnimationFrame(tick);
  })`);
  check("the window is painting", fps > 10, `${fps} frames in a second`);

  // Rich Presence: the bridge has to be reachable from the page, and sending
  // through it with no application id configured must be a no-op rather than
  // an error — that is the state every install starts in.
  const presence = await win.webContents.executeJavaScript(`(() => {
    try {
      if (typeof window.__fluxPresence !== "function") return "missing";
      window.__fluxPresence({ clientId: null });
      return "ok";
    } catch (e) { return "threw: " + e.message; }
  })()`);
  check("the Discord bridge is reachable", presence === "ok", presence);

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  clearTimeout(deadline);
  console.log(FAIL.length ? `\n${FAIL.length} check(s) failed\n` : "\ndesktop shell ok\n");
  app.exit(FAIL.length ? 1 : 0);
});
