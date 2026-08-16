// Debounced persistence for zustand: serialization + localStorage writes are
// deferred until the store has been quiet for a moment (with a hard flush on
// tab hide), instead of stringifying the entire library on every state change.
// Progress ticks and slider drags fire many times a second — eager writes were
// freezing the UI once libraries grew.
import type { PersistStorage, StorageValue } from "zustand/middleware";

export function lazyJsonStorage<S>(delay = 1500): PersistStorage<S> {
  let pending: StorageValue<S> | null = null;
  let pendingKey = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: unknown = null; // last queued/written partialized state

  // zustand's persist calls setItem on EVERY store write, including 4Hz
  // progress ticks that change nothing persisted. Partialized slices keep
  // reference identity when untouched, so a shallow compare is enough to
  // skip the (expensive) stringify + synchronous localStorage write.
  const sameShallow = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    try {
      localStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch (e) {
      console.warn("persist failed:", e);
    }
    pending = null;
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  return {
    getItem: (name) => {
      if (pending && pendingKey === name) return pending;
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      const st = (value as { state?: unknown } | null)?.state;
      if (lastState && sameShallow(st, lastState)) return; // nothing persisted changed
      lastState = st;
      pendingKey = name;
      pending = value;
      if (!timer) timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      if (pendingKey === name) pending = null;
      lastState = null;
      localStorage.removeItem(name);
    },
  };
}
