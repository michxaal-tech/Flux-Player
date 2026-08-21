// Tells the page it is running in the desktop shell.
//
// Two things read it: the visual engine raises its backing-store ceiling from
// 1800px to 2560px (see MAX_EDGE in src/visualizer/engine.ts), and the service
// worker registration is skipped, since the build is already on disk here and
// a cache could only serve a stale copy of it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__fluxDesktop", true);

// Rich Presence: the page describes what is playing, the main process does the
// talking. Deliberately one-way — the page has nothing to learn from Discord,
// and a one-way channel cannot be turned into a way to reach the file system.
contextBridge.exposeInMainWorld("__fluxPresence", (state) => {
  ipcRenderer.send("flux:presence", state);
});
