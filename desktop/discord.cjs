// Discord Rich Presence, spoken directly.
//
// Discord's client listens on a local named pipe — \\.\pipe\discord-ipc-0 on
// Windows, a unix socket under the user's runtime directory elsewhere — and
// the protocol over it is small enough that talking to it directly is less
// code than wiring up a library for it, and does not put an abandoned
// dependency between the app and the only thing it needs from the socket.
//
// A frame is a 4-byte little-endian opcode, a 4-byte little-endian length, and
// that many bytes of JSON. Opcode 0 is the handshake, 1 is a command, 2 is a
// close. That is the entire surface used here.
//
// None of this is reachable from a web page, which is why the feature is
// desktop-only: a browser tab cannot open a local socket, and no amount of
// permission-granting changes that.
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

/** Every path Discord might be listening on, in the order worth trying. */
function candidatePaths() {
  if (process.platform === "win32") {
    return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  // Linux and macOS: the socket lives in whichever runtime dir is set, and
  // under Flatpak or Snap it is nested a level deeper again.
  const base =
    process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir();
  const dirs = [base, path.join(base, "app", "com.discordapp.Discord"), path.join(base, "snap.discord")];
  const out = [];
  for (const d of dirs) for (let i = 0; i < 10; i++) out.push(path.join(d, `discord-ipc-${i}`));
  return out;
}

function encode(op, payload) {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class Presence {
  constructor() {
    this.socket = null;
    this.ready = false;
    this.clientId = null;
    this.pending = null;
    this.connecting = false;
    this.retryAt = 0;
  }

  /** Connect if we aren't, then send whatever the last activity was. */
  async connect(clientId) {
    if (this.clientId !== clientId) this.disconnect();
    this.clientId = clientId;
    if (this.ready || this.connecting) return;
    // Discord may simply not be running. Retrying every update would mean a
    // connection attempt per track change forever, so failures back off.
    if (Date.now() < this.retryAt) return;
    this.connecting = true;

    for (const p of candidatePaths()) {
      const sock = await new Promise((res) => {
        const s = net.createConnection(p);
        const fail = () => { s.destroy(); res(null); };
        s.once("error", fail);
        s.once("connect", () => { s.removeListener("error", fail); res(s); });
        setTimeout(fail, 400);
      });
      if (!sock) continue;

      this.socket = sock;
      sock.on("error", () => this.disconnect());
      sock.on("close", () => this.disconnect());
      sock.on("data", (buf) => {
        // The only reply that matters is the handshake's: once it lands the
        // socket will accept activity frames.
        if (buf.length >= 8 && buf.readInt32LE(0) === OP_FRAME && !this.ready) {
          this.ready = true;
          if (this.pending) this.send(this.pending);
        }
      });
      sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: clientId }));
      this.connecting = false;
      return;
    }
    this.connecting = false;
    this.retryAt = Date.now() + 30000;
  }

  send(activity) {
    this.pending = activity;
    if (!this.socket || !this.ready) return;
    try {
      this.socket.write(
        encode(OP_FRAME, {
          cmd: "SET_ACTIVITY",
          // Discord requires a pid it can attribute the presence to
          args: { pid: process.pid, activity },
          nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        })
      );
    } catch {
      this.disconnect();
    }
  }

  clear() {
    this.pending = null;
    if (this.socket && this.ready) {
      try {
        this.socket.write(encode(OP_FRAME, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid },
          nonce: `${Date.now()}`,
        }));
      } catch { /* going away anyway */ }
    }
  }

  disconnect() {
    this.ready = false;
    this.connecting = false;
    if (this.socket) {
      try { this.socket.write(encode(OP_CLOSE, {})); } catch { /* already gone */ }
      try { this.socket.destroy(); } catch { /* already gone */ }
    }
    this.socket = null;
  }
}

const presence = new Presence();

/**
 * Apply what the renderer says is playing.
 *
 * `state` is `{ clientId, name, artist, playing, position, duration }` — or
 * `{ clientId: null }` to turn the whole thing off.
 */
async function update(state) {
  if (!state || !state.clientId) {
    presence.clear();
    presence.disconnect();
    return;
  }
  await presence.connect(state.clientId);
  if (!state.name || !state.playing) {
    presence.clear();
    return;
  }

  // Discord wants the *end* time to show a countdown, and it has to be
  // absolute — so it is computed from how far into the track we are rather
  // than from the track's length, or every pause and seek would leave the
  // timer telling a different story from the audio.
  const now = Date.now();
  const timestamps =
    state.duration > 0 && state.position >= 0
      ? { start: Math.round(now - state.position * 1000), end: Math.round(now + (state.duration - state.position) * 1000) }
      : undefined;

  presence.send({
    // 2 is "Listening to", which is what Spotify shows and what this is
    type: 2,
    details: String(state.name).slice(0, 128),
    state: state.artist ? String(state.artist).slice(0, 128) : "FLUX Player",
    timestamps,
    assets: { large_image: "flux", large_text: "FLUX Player" },
    instance: false,
  });
}

module.exports = { update, disconnect: () => presence.disconnect() };
