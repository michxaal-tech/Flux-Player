/**
 * Shows what you're playing on your Discord profile, the way Spotify does.
 *
 * Desktop only, and not by choice: Rich Presence is an IPC conversation with
 * the Discord client over a local socket, which a browser tab cannot open. The
 * web build simply never starts this — there is no control to be found and
 * disappointed by, because a control that cannot work is worse than its
 * absence.
 *
 * It also needs a Discord *application ID*, which identifies the app whose name
 * appears on the profile line. There is no shared one to use: an ID belongs to
 * whoever registered it, and the name Discord shows is that application's name,
 * so borrowing one would put someone else's name on your profile. So it is
 * entered here, like the AI keys — see the DISCORD section of the settings.
 */
import { useStore, getCurrentTrack } from "./store/useStore";

type PresenceFn = (state: {
  clientId: string | null;
  name?: string;
  artist?: string;
  playing?: boolean;
  position?: number;
  duration?: number;
}) => void;

const bridge = (): PresenceFn | null =>
  typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).__fluxPresence as PresenceFn) ?? null : null;

/** True when this build can do it at all — the desktop shell, with the bridge. */
export const presenceAvailable = (): boolean => !!bridge();

let last = "";

function push(force = false): void {
  const send = bridge();
  if (!send) return;
  const s = useStore.getState();
  const id = (s.discordAppId ?? "").trim();
  if (!id) {
    if (last !== "off" || force) { send({ clientId: null }); last = "off"; }
    return;
  }
  const tr = getCurrentTrack(s);
  // Rounded to the second: the progress ticks many times a second, and Discord
  // rate-limits activity updates — sending one per frame gets the connection
  // throttled and the presence stops updating at all.
  const pos = Math.round(s.progress * (s.duration || 0));
  const key = `${id}|${tr?.name ?? ""}|${s.playing}|${pos}`;
  if (key === last && !force) return;
  last = key;
  send({
    clientId: id,
    name: tr?.name ?? "",
    artist: tr?.artist ?? "",
    playing: s.playing,
    position: pos,
    duration: s.duration || 0,
  });
}

/** Starts watching. Safe to call in the web build: it does nothing there. */
export function startDiscordPresence(): void {
  if (!bridge()) return;
  // Track, play state and the app id are the things worth reacting to. Position
  // is deliberately not one of them — it changes constantly, and Discord counts
  // the remaining time itself from the timestamps it was given.
  useStore.subscribe(
    (s) => [getCurrentTrack(s)?.fileId, s.playing, s.discordAppId] as const,
    () => push(),
    { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] }
  );
  // A periodic nudge keeps the elapsed time honest across seeks, and re-arms
  // the connection if Discord was started after the player was.
  window.setInterval(() => push(true), 20000);
  push(true);
}
