import { useEffect } from "react";
import { shallow } from "zustand/shallow";
import { engine } from "../audio/engine";
import { nextTrack, prevTrack, seek, togglePlay } from "../audio/transport";
import { getCurrentTrack, getPlayingList, useStore } from "../store/useStore";

/** Lock-screen / notification transport controls with correct metadata. */
export function useMediaSession(): void {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    ms.setActionHandler("play", () => togglePlay());
    ms.setActionHandler("pause", () => togglePlay());
    ms.setActionHandler("previoustrack", () => prevTrack());
    ms.setActionHandler("nexttrack", () => nextTrack());
    try {
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) seek(d.seekTime);
      });
      ms.setActionHandler("seekbackward", (d) => {
        seek(Math.max(0, engine.audio.currentTime - (d.seekOffset || 10)));
      });
      ms.setActionHandler("seekforward", (d) => {
        seek(engine.audio.currentTime + (d.seekOffset || 10));
      });
    } catch { /* optional actions */ }

    const unsubTrack = useStore.subscribe(
      (s) => getCurrentTrack(s),
      (tr) => {
        const s = useStore.getState();
        ms.metadata = new MediaMetadata({
          title: tr?.name ?? "FLUX PRO",
          artist: "FLUX PRO",
          album: getPlayingList(s).name,
          artwork: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
        });
      },
      { fireImmediately: true }
    );
    const unsubPlaying = useStore.subscribe(
      (s) => s.playing,
      (playing) => { ms.playbackState = playing ? "playing" : "paused"; },
      { fireImmediately: true }
    );
    const unsubPos = useStore.subscribe(
      (s) => [s.progress, s.duration] as const,
      ([progress, duration]) => {
        if (!duration || !isFinite(duration)) return;
        try {
          ms.setPositionState({
            duration,
            playbackRate: engine.audio.playbackRate || 1,
            position: Math.min(progress, duration),
          });
        } catch { /* invalid state during track switch */ }
      },
      { equalityFn: shallow }
    );

    return () => {
      unsubTrack();
      unsubPlaying();
      unsubPos();
    };
  }, []);
}
