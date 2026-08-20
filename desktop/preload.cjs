// Tells the page it is running in the desktop shell.
//
// Two things read it: the visual engine raises its backing-store ceiling from
// 1800px to 2560px (see MAX_EDGE in src/visualizer/engine.ts), and the service
// worker registration is skipped, since the build is already on disk here and
// a cache could only serve a stale copy of it.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("__fluxDesktop", true);
