/**
 * The scrubbable timeline, and the drop markers along it.
 *
 * Shared rather than duplicated: the player tab draws it over the decoded
 * waveform and the visualizer overlay draws a slim version of it over nothing,
 * but "where is the pointer, what time is that, and where are the drops" is one
 * behaviour and deserves one implementation. It went in twice once and the two
 * copies disagreed about the marker offset within a day.
 */
import { useEffect, useState } from "react";
import type React from "react";
import { CYAN, MAG, MONO } from "../constants";
import { seek } from "../audio/transport";
import { useStore } from "../store/useStore";
import { live } from "../visualizer/live";
import { mix } from "../theme";
import { fmt } from "../utils";

/**
 * How far before a drop its marker sits, in seconds.
 *
 * Seeking to the exact moment of a drop means the drop has already happened by
 * the time audio starts — you land in the aftermath, having missed the thing
 * you clicked for. A beat and a half of run-up puts it in front of you.
 */
export const DROP_LEAD = 1.4;

/**
 * Drop markers positioned along whatever they are laid over.
 *
 * Polled rather than subscribed: the analysis is written onto the render-loop
 * state when the worker finishes, which is not a React store update.
 */
export function DropMarkers({
  duration,
  onSeek,
  height = "100%",
}: {
  duration: number;
  onSeek: (t: number) => void;
  height?: string;
}) {
  const [drops, setDrops] = useState<number[]>([]);
  useEffect(() => {
    const read = () => {
      const d = live.anal?.drops;
      setDrops((prev) => {
        const next = d && live.analOn ? d : [];
        return prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : [...next];
      });
    };
    read();
    const id = window.setInterval(read, 700);
    return () => window.clearInterval(id);
  }, []);
  if (!duration || !drops.length) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {drops.map((d, i) => {
        const at = Math.max(0, d - DROP_LEAD);
        const left = (at / duration) * 100;
        if (left < 0 || left > 100) return null;
        return (
          <button
            key={i}
            title={`drop at ${fmt(d)}`}
            onMouseDown={(e) => { e.stopPropagation(); onSeek(at); }}
            onTouchStart={(e) => { e.stopPropagation(); onSeek(at); }}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: 0,
              bottom: 0,
              // A hair wide to look at, wide enough to hit with a thumb: the
              // visible line is the child, this is the target.
              width: 14,
              marginLeft: -7,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              pointerEvents: "auto",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: 1.5,
                height,
                background: `linear-gradient(180deg, transparent, ${mix(MAG, 55)} 22%, ${mix(MAG, 55)} 78%, transparent)`,
                borderRadius: 1,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Starts a scrub that follows the pointer until it is released.
 *
 * The move and release listeners go on the window rather than the element: a
 * timeline is a few pixels tall, so every real drag leaves it, and listening on
 * the element itself stops the scrub dead and strands the pointer in a dragging
 * state with nothing to end it.
 */
export function beginScrub(
  e: React.MouseEvent | React.TouchEvent,
  el: HTMLElement | null,
  duration: number
): void {
  if (!el || !duration) return;
  const at = (clientX: number) => {
    const r = el.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };
  const touch = "touches" in e;
  at(touch ? e.touches[0].clientX : e.clientX);
  const move = (ev: MouseEvent | TouchEvent) =>
    at("touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX);
  const up = () => {
    window.removeEventListener(touch ? "touchmove" : "mousemove", move as EventListener);
    window.removeEventListener(touch ? "touchend" : "mouseup", up);
    window.removeEventListener("touchcancel", up);
  };
  window.addEventListener(touch ? "touchmove" : "mousemove", move as EventListener);
  window.addEventListener(touch ? "touchend" : "mouseup", up);
  window.addEventListener("touchcancel", up);
}

/**
 * The slim timeline for the visualizer overlay.
 *
 * The overlay had no way to move through a track at all — you could skip to the
 * next one or close the whole thing and go back to the player, which is a lot
 * of ceremony for "play that bit again". It is deliberately thin and low
 * contrast: the point of the overlay is the picture behind it.
 */
export function MiniTimeline() {
  const progress = useStore((s) => s.progress);
  const duration = useStore((s) => s.duration);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  if (!duration) return null;
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div style={{ width: "min(86vw, 620px)", pointerEvents: "auto" }}>
      <div
        ref={setEl}
        onMouseDown={(e) => beginScrub(e, el, duration)}
        onTouchStart={(e) => beginScrub(e, el, duration)}
        style={{
          position: "relative",
          height: 22,
          display: "flex",
          alignItems: "center",
          cursor: "ew-resize",
          touchAction: "none",
        }}
      >
        {/* the track, and the part of it already played */}
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
        <div
          style={{
            position: "absolute", left: 0, width: `${pct}%`, height: 3, borderRadius: 2,
            background: `linear-gradient(90deg, ${CYAN}, ${MAG})`, boxShadow: `0 0 12px ${mix(CYAN, 45)}`,
          }}
        />
        <DropMarkers duration={duration} onSeek={seek} height="70%" />
        {/* the handle sits above the markers, so it is never hidden behind one */}
        <div
          style={{
            position: "absolute", left: `${pct}%`, marginLeft: -5, width: 10, height: 10,
            borderRadius: "50%", background: "#fff", boxShadow: `0 0 10px ${mix(CYAN, 70)}`, pointerEvents: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -2 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{fmt(progress * duration)}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{fmt(duration)}</span>
      </div>
    </div>
  );
}
