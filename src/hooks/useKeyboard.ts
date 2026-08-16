import { useEffect } from "react";
import { nextTrack, prevTrack, tapCue, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";

export interface Shortcut {
  keys: string;
  does: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "Space", does: "Play / pause" },
  { keys: "← / →", does: "Previous / next track" },
  { keys: "↑ / ↓", does: "Volume up / down" },
  { keys: "[ / ]", does: "Speed −0.05 / +0.05" },
  { keys: "L", does: "Loop: set A, set B, clear" },
  { keys: "F", does: "Favorite current track" },
  { keys: "P", does: "Pin current FX to track" },
  { keys: "S", does: "Toggle shuffle" },
  { keys: "R", does: "Cycle repeat mode" },
  { keys: "M", does: "Mute / unmute" },
  { keys: "V", does: "Open visualizer" },
  { keys: "1–4", does: "Hot cues A–D (set / jump)" },
  { keys: "?", does: "Show this panel" },
  { keys: "Esc", does: "Close overlays" },
];

let lastVolume = 0.85;

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;
      if (target.tagName === "TEXTAREA") return;
      const st = useStore.getState();
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          return;
        case "ArrowRight": nextTrack(); return;
        case "ArrowLeft": prevTrack(); return;
        case "ArrowUp":
          e.preventDefault();
          useStore.setState({ volume: Math.min(1, st.volume + 0.05) });
          return;
        case "ArrowDown":
          e.preventDefault();
          useStore.setState({ volume: Math.max(0, st.volume - 0.05) });
          return;
        case "Escape":
          useStore.setState({ visPanel: false, visOpen: false, shortcutsOpen: false });
          return;
        case "BracketLeft":
          st.setFxKey("speed", Math.max(0.5, +(st.fx.speed - 0.05).toFixed(2)));
          return;
        case "BracketRight":
          st.setFxKey("speed", Math.min(1.5, +(st.fx.speed + 0.05).toFixed(2)));
          return;
        case "Digit1": case "Digit2": case "Digit3": case "Digit4":
          tapCue(+e.code.slice(5) - 1);
          return;
      }
      switch (e.key.toLowerCase()) {
        case "f": {
          const tr = getCurrentTrack(st);
          if (tr) st.toggleFav(tr.id);
          return;
        }
        case "l":
          if (st.loopA === null) useStore.setState({ loopA: st.progress });
          else if (st.loopB === null && st.progress > st.loopA) useStore.setState({ loopB: st.progress });
          else useStore.setState({ loopA: null, loopB: null });
          return;
        case "p": st.togglePinCurrent(); return;
        case "s": useStore.setState({ shuffle: !st.shuffle }); return;
        case "r":
          useStore.setState({ repeat: st.repeat === "off" ? "all" : st.repeat === "all" ? "one" : "off" });
          return;
        case "m":
          if (st.volume > 0) {
            lastVolume = st.volume;
            useStore.setState({ volume: 0 });
          } else useStore.setState({ volume: lastVolume });
          return;
        case "v": useStore.setState({ visOpen: true }); return;
        case "?": useStore.setState({ shortcutsOpen: !st.shortcutsOpen }); return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
