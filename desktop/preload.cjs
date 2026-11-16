// Tells the page it is running in the desktop shell.
//
// The service worker registration reads it and is skipped, since the build is
// already on disk here and a cache could only serve a stale copy of it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__fluxDesktop", true);
// lets the page lay itself out around the Mac traffic lights
contextBridge.exposeInMainWorld("__fluxPlatform", process.platform);

// Rich Presence: the page describes what is playing, the main process does the
// talking. Deliberately one-way — the page has nothing to learn from Discord,
// and a one-way channel cannot be turned into a way to reach the file system.
contextBridge.exposeInMainWorld("__fluxPresence", (state) => {
  ipcRenderer.send("flux:presence", state);
});
