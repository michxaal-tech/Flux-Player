import { useEffect, useState } from "react";
import { BORDER, CYAN, MAG } from "../constants";
import { useStore } from "../store/useStore";
import { chip, Module } from "./ui";
import {
  loadConnections,
  saveConnections,
  refreshConnectorSources,
  pingConnection,
  type Connection,
  type ConnKind,
} from "../connectors";
import { uid } from "../utils";

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)",
  border: BORDER, borderRadius: 9, padding: "8px 10px", fontSize: 11.5, color: "#fff", outline: "none",
};
const label: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", marginBottom: 3, display: "block",
};

const blank = (): Connection => ({ id: uid(), kind: "subsonic", name: "", baseUrl: "", user: "", secret: "" });

/**
 * Bring-your-own-credentials settings.
 *
 * You add a service you have access to — a self-hosted Subsonic server is the
 * turnkey one — and it joins the Discover picker. Credentials live in the
 * browser's IndexedDB, never in the exported app state, and never leave the
 * device except in the requests you make to the server you named.
 */
export function ConnectionsPanel() {
  const [list, setList] = useState<Connection[]>([]);
  const [draft, setDraft] = useState<Connection | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const bump = () => useStore.setState({ connectorRev: Date.now() });

  useEffect(() => {
    loadConnections().then(setList);
  }, []);

  const persist = async (next: Connection[]) => {
    setList(next);
    await saveConnections(next);
    await refreshConnectorSources();
    bump();
  };

  const commit = async () => {
    if (!draft) return;
    const d = { ...draft, name: draft.name.trim(), baseUrl: draft.baseUrl.trim() };
    if (!d.name || !d.baseUrl || !d.secret) {
      setStatus((s) => ({ ...s, draft: "Name, server URL and key are all required." }));
      return;
    }
    const next = list.some((c) => c.id === d.id)
      ? list.map((c) => (c.id === d.id ? d : c))
      : [...list, d];
    await persist(next);
    setDraft(null);
    setStatus((s) => ({ ...s, draft: "" }));
  };

  const remove = async (id: string) => {
    await persist(list.filter((c) => c.id !== id));
  };

  const test = async (conn: Connection) => {
    setTesting(conn.id);
    setStatus((s) => ({ ...s, [conn.id]: "Testing…" }));
    try {
      const msg = await pingConnection(conn);
      setStatus((s) => ({ ...s, [conn.id]: msg }));
    } catch (e) {
      setStatus((s) => ({ ...s, [conn.id]: e instanceof Error ? e.message : "Failed" }));
    }
    setTesting(null);
  };

  return (
    <Module
      title="🔌 CONNECTIONS"
      extra={
        !draft && (
          <button
            onClick={() => setDraft(blank())}
            style={{ ...chip(false, CYAN), padding: "5px 10px", fontSize: 9.5 }}
          >+ ADD</button>
        )
      }
    >
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
        Plug in a music service you have your own access to. A self-hosted{" "}
        <b style={{ color: "rgba(255,255,255,0.75)" }}>Subsonic</b> server — Navidrome, Airsonic,
        Gonic, Funkwhale — drops straight into the Discover picker with full-length streaming, the
        visualizer and the whole FX rack. Keys are stored only on this device.
      </div>

      {list.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map((c) => (
            <div key={c.id} style={{ border: BORDER, borderRadius: 10, padding: "9px 11px", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>
                    {c.name} <span style={{ fontSize: 9, color: MAG, fontWeight: 800 }}>{c.kind.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.baseUrl}</div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => test(c)} disabled={testing === c.id} style={{ ...chip(false, CYAN), padding: "5px 9px", fontSize: 9 }}>TEST</button>
                  <button onClick={() => setDraft({ ...c })} style={{ ...chip(false, CYAN), padding: "5px 9px", fontSize: 9 }}>EDIT</button>
                  <button onClick={() => remove(c.id)} style={{ ...chip(false, MAG), padding: "5px 9px", fontSize: 9 }}>✕</button>
                </div>
              </div>
              {status[c.id] && (
                <div style={{ fontSize: 10, marginTop: 5, color: status[c.id] === "Connected." ? CYAN : "rgba(255,180,180,0.85)" }}>{status[c.id]}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div style={{ marginTop: 10, border: `1px solid ${MAG}`, borderRadius: 10, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["subsonic", "generic"] as ConnKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setDraft({ ...draft, kind: k })}
                style={{ ...chip(draft.kind === k, MAG), flex: 1, padding: "7px 6px", fontSize: 10 }}
              >{k === "subsonic" ? "SUBSONIC SERVER" : "OTHER (KEY ONLY)"}</button>
            ))}
          </div>

          <div>
            <label style={label}>DISPLAY NAME</label>
            <input style={input} value={draft.name} placeholder="My Server" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label style={label}>SERVER URL</label>
            <input style={input} value={draft.baseUrl} placeholder="https://music.example.com" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
          </div>

          {draft.kind === "subsonic" ? (
            <>
              <div>
                <label style={label}>USERNAME</label>
                <input style={input} value={draft.user ?? ""} placeholder="your login" onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
              </div>
              <div>
                <label style={label}>PASSWORD / API KEY</label>
                <input style={input} type="password" value={draft.secret} placeholder="••••••••" onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                Sent with per-request salted-token auth (never in plaintext). Your server must allow
                CORS for the browser build — Navidrome does by default.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>HEADER</label>
                  <input style={input} value={draft.header ?? ""} placeholder="Authorization" onChange={(e) => setDraft({ ...draft, header: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label}>PREFIX</label>
                  <input style={input} value={draft.scheme ?? ""} placeholder="Bearer " onChange={(e) => setDraft({ ...draft, scheme: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={label}>API KEY / TOKEN</label>
                <input style={input} type="password" value={draft.secret} placeholder="••••••••" onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                Stored for your own use — FLUX keeps the key but doesn't browse this kind
                automatically, since it can't know the service's response shape. You're responsible
                for having legitimate access to whatever you point it at.
              </div>
            </>
          )}

          {status.draft && <div style={{ fontSize: 10.5, color: "rgba(255,180,180,0.9)" }}>{status.draft}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={commit} style={{ ...chip(true, CYAN), flex: 1, padding: "9px 6px", fontSize: 11 }}>SAVE</button>
            <button onClick={() => { setDraft(null); setStatus((s) => ({ ...s, draft: "" })); }} style={{ ...chip(false, MAG), flex: 1, padding: "9px 6px", fontSize: 11 }}>CANCEL</button>
          </div>
        </div>
      )}
    </Module>
  );
}
