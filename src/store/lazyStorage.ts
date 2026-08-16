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
      pendingKey = name;
      pending = value;
      if (!timer) timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      if (pendingKey === name) pending = null;
      localStorage.removeItem(name);
    },
  };
}
