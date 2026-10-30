// The playback clock: one answer to "where in the song are we, as heard?"
//
// Visuals, lyrics and the scrubber all read this, so they cannot disagree.
//
// Three problems it exists to solve:
//
// 1. `audio.currentTime` is coarse. It advances in steps (audio callback
//    sized), so anything drawn from it directly stutters. The clock runs its own
//    estimate forward at the playback rate every frame and slews it toward the
//    element's value, snapping only on a real discontinuity.
//
// 2. The element's time is what the decoder has reached, not what is leaving
//    the speakers. The gap is the context's base + output latency (≈20-120ms),
//    plus whatever a Bluetooth sink adds that the browser cannot see — that last
//    part is the user's sync offset. The *audible* time subtracts both, scaled by
//    the playback rate because latency is wall-clock and the song is not.
//
// 3. Discontinuities — seeks, loops, track changes, repeat — must be explicit,
//    so consumers can recover cleanly instead of firing every beat they "crossed"
//    on the way. Each one bumps `epoch`.
import { engine } from "../audio/engine";
import { useStore, getCurrentTrack } from "../store/useStore";
import { isYouTube, ytTime } from "../youtube";

class PlaybackClock {
  /** smoothed media position, seconds */
  private est = 0;
  private lastPerf = 0;
  private lastRaw = -1;
  private rawStillSince = 0;
  /** the audible time can't run behind this until it catches up — after a
   * seek or a resume nothing is audible from before the jump point */
  private anchor = 0;
  /** what was audible when playback stopped — held while paused */
  private frozen = 0;
  private wasPlaying = false;
  /** bumped on every discontinuity: seek, loop jump, track change, repeat */
  epoch = 0;
  playing = false;
  /** stalled waiting for data */
  buffering = false;
  rate = 1;
  /** "audio" (decoded, analysable), "youtube" (iframe, opaque) or "none" */
  source: "audio" | "youtube" | "none" = "none";
  private wired = false;

  wire(): void {
    if (this.wired) return;
    this.wired = true;
    const el = engine.audio;
    const jump = () => this.discontinuity(el.currentTime);
    el.addEventListener("seeking", jump);
    el.addEventListener("seeked", jump);
    el.addEventListener("emptied", () => this.discontinuity(0));
    el.addEventListener("loadstart", () => this.discontinuity(0));
    el.addEventListener("waiting", () => { this.buffering = true; });
    el.addEventListener("stalled", () => { if (!el.paused) this.buffering = true; });
    el.addEventListener("playing", () => { this.buffering = false; });
    el.addEventListener("canplay", () => { this.buffering = false; });
    el.addEventListener("ratechange", () => { this.rate = el.playbackRate || 1; });

    // a track change through the YouTube path never touches the element
    useStore.subscribe((s) => getCurrentTrack(s)?.id, () => this.discontinuity(0));
  }

  private discontinuity(t: number): void {
    this.epoch++;
    this.est = t;
    this.anchor = t;
    this.frozen = t;
    this.lastRaw = t;
  }

  /** Output latency the browser knows about plus the user's offset, seconds of wall time. */
  latency(): number {
    const ctx = engine.nodes?.ctx;
    const auto = ctx ? (ctx.baseLatency || 0) + ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0) : 0;
    const user = (useStore.getState().syncMs || 0) / 1000;
    return Math.max(0, Math.min(0.6, auto + user));
  }

  /** Advance once per animation frame. */
  tick(now: number): void {
    const s = useStore.getState();
    const tr = getCurrentTrack(s);
    const dt = this.lastPerf ? Math.min(0.25, Math.max(0, (now - this.lastPerf) / 1000)) : 0;
    this.lastPerf = now;
    let raw: number;
    if (tr && isYouTube(tr)) {
      this.source = "youtube";
      raw = ytTime();
      this.playing = s.playing;
      this.rate = 1;
    } else {
      const el = engine.audio;
      this.source = el.src ? "audio" : "none";
      raw = el.currentTime || 0;
      this.playing = !el.paused && !el.ended && this.source === "audio";
      this.rate = el.playbackRate || 1;
    }
    // A stuck position while nominally playing is buffering, whatever the
    // events said (some streams never fire `waiting`).
    if (raw !== this.lastRaw) { this.rawStillSince = now; this.lastRaw = raw; if (this.buffering && this.playing) this.buffering = false; }
    else if (this.playing && now - this.rawStillSince > 400) this.buffering = true;

    if (!this.playing) {
      // Stopping: what the listener last heard is the decoder position minus
      // the output latency, and that is where everything should hold — not
      // jump forward by the latency as the compensation drops out.
      if (this.wasPlaying) this.frozen = this.source === "audio" ? Math.max(this.anchor, this.est - this.latency() * this.rate) : this.est;
      this.wasPlaying = false;
      this.est = raw;
      return;
    }
    if (!this.wasPlaying) {
      // Resuming: nothing new is audible until the latency has passed, so the
      // audible time holds at the frozen point and then carries on from it.
      this.wasPlaying = true;
      this.anchor = this.frozen;
    }
    if (!this.buffering) this.est += dt * this.rate;
    const err = raw - this.est;
    if (Math.abs(err) > 0.35) {
      // a jump nobody announced: an A-B loop, a stutter, an iframe seek
      this.discontinuity(raw);
    } else {
      // slew rather than snap: ~150ms to absorb the element's step size
      this.est += err * Math.min(1, dt * 7);
    }
  }

  /** Smoothed decoder position, seconds. */
  media(): number { return this.est; }

  /** Position currently reaching the listener's ears, seconds of media time. */
  audible(): number {
    if (!this.playing) return this.source === "audio" ? this.frozen : this.est;
    if (this.source !== "audio") return this.est;
    return Math.max(this.anchor, this.est - this.latency() * this.rate);
  }
}

export const clock = new PlaybackClock();

if (typeof window !== "undefined") (window as unknown as { __fluxClock: PlaybackClock }).__fluxClock = clock;
