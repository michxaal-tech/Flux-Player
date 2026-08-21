// FLUX Player desktop shell.
//
// This is a window around the same build that ships to the web, not a second
// implementation — so a fix made once shows up in both. What it adds is the
// two things a web page cannot do for itself: Chromium's GPU flags, and a
// higher pixel ceiling for the visual engine.
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require("electron");
const discord = require("./discord.cjs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_DIR = path.join(__dirname, "app");

// A stable origin of its own.
//
// Loading the build over file:// renders the markup and breaks everything that
// needs an origin: IndexedDB — which is where the music library lives — web
// workers, and every secure-context API. A localhost server would give one,
// but the library would be keyed to its port, so a launch where that port
// happened to be taken would come up with an empty library and no explanation.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "flux",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// The reason to run as a desktop app at all. Chromium blocklists GPU
// rasterisation on a lot of ordinary laptop graphics drivers, and the visual
// engine is entirely canvas rasterisation — so on the machines most likely to
// stutter, the browser is doing the whole thing on the CPU and will not be
// argued out of it. A page cannot override that. This can.
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#08090D",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // The render loop is the app. Letting Chromium throttle it because the
      // window lost focus would stall the visuals while the music kept going.
      backgroundThrottling: false,
    },
  });
  // Anything the app opens externally — a lyrics source, a track page — goes
  // to the real browser rather than opening a second chrome-less window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL("flux://app/");
  return win;
}

app.whenReady().then(() => {
  protocol.handle("flux", (req) => {
    let rel = decodeURIComponent(new URL(req.url).pathname);
    if (rel === "" || rel === "/") rel = "/index.html";
    const file = path.join(APP_DIR, path.normalize(rel));
    // never serve outside the bundled build, whatever the URL says
    if (!file.startsWith(APP_DIR)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Rich Presence. The renderer sends what is playing; talking to Discord's
// local socket is the main process's job because a page cannot open one.
ipcMain.on("flux:presence", (_e, state) => {
  discord.update(state).catch(() => { /* Discord not running is not an error */ });
});

app.on("before-quit", () => discord.disconnect());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
