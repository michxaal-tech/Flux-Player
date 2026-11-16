// Interface primitives. Each one carries its own motion, designed with it:
// the segmented pill slides and squashes, the switch knob travels on a spring
// and stretches while it moves, the slider follows the pointer exactly and only
// eases when the value changes from elsewhere, menus unfold from the control
// that opened them and slide sideways into nested pages.
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { I } from "./icons";
import { ease, spring } from "./motion";

// ── Segmented ──────────────────────────────────────────────────────────────
export interface SegOption<T extends string> { id: T; label: ReactNode; icon?: ReactNode; title?: string }

export function Segmented<T extends string>({
  options, value, onChange, size = "md", stretch, label,
}: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; stretch?: boolean; label?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: RKeyboardEvent) => {
    const i = options.findIndex((o) => o.id === value);
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };
  const h = size === "sm" ? 30 : 36;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      style={{
        display: stretch ? "flex" : "inline-flex", padding: 3, borderRadius: 999, gap: 2,
        background: "var(--surface)", border: "1px solid var(--line)", position: "relative",
      }}
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.id)}
            style={{
              position: "relative", flex: stretch ? 1 : undefined, height: h, padding: size === "sm" ? "0 12px" : "0 16px",
              border: 0, background: "transparent", borderRadius: 999,
              color: on ? "var(--on-accent)" : "var(--text-2)", fontSize: size === "sm" ? 12.5 : 13.5, fontWeight: 600,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "color var(--t2) var(--ease-out)", whiteSpace: "nowrap",
            }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring.slide}
                style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--accent)", zIndex: 0 }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{o.icon}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Switch ────────────────────────────────────────────────────────────────
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: 46, height: 28, borderRadius: 999, border: 0, padding: 3, flexShrink: 0,
        background: on ? "var(--accent)" : "var(--surface-3)", position: "relative",
        transition: "background-color var(--t3) var(--ease-out)",
        display: "flex", justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <motion.span
        layout
        transition={spring.snap}
        style={{
          height: 22, borderRadius: 999, display: "block",
          width: pressed ? 28 : 22,
          background: on ? "var(--on-accent)" : "var(--text)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────
// The fill tracks the pointer exactly while dragging (no easing between the
// hand and the value), and only animates when the value changes from
// somewhere else — a preset, a reset — so it never lags and never snaps.
export function Slider({
  value, min = 0, max = 1, step = 0.01, onChange, label, format, center, disabled, onCommit,
}: {
  value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void;
  label: string; format?: (v: number) => string; center?: number; disabled?: boolean; onCommit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);
  const frac = (Math.min(max, Math.max(min, value)) - min) / (max - min);
  const c0 = center !== undefined ? (center - min) / (max - min) : 0;
  const fromX = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const raw = min + f * (max - min);
    return Math.round(raw / step) * step;
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag(true);
    onChange(fromX(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => { if (drag) onChange(fromX(e.clientX)); };
  const onUp = () => { if (drag) { setDrag(false); onCommit?.(); } };
  const onKey = (e: RKeyboardEvent) => {
    const big = (max - min) / 10;
    let v = value;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v += e.shiftKey ? big : step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= e.shiftKey ? big : step;
    else if (e.key === "Home") v = min;
    else if (e.key === "End") v = max;
    else return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  };
  const lo = Math.min(c0, frac), hi = Math.max(c0, frac);
  const t = drag ? "none" : "left var(--t3) var(--ease-out), width var(--t3) var(--ease-out), transform var(--t2) var(--ease-spring)";
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={+value.toFixed(3)}
      aria-valuetext={format ? format(value) : undefined}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onKeyDown={onKey}
      style={{ position: "relative", height: 28, touchAction: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 12, height: 4, borderRadius: 4, background: "var(--surface-3)" }} />
      <div style={{ position: "absolute", top: 12, height: 4, borderRadius: 4, background: "var(--accent)", left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, transition: t }} />
      <div
        style={{
          position: "absolute", top: 14, left: `${frac * 100}%`, width: 18, height: 18, marginLeft: -9, marginTop: -9,
          borderRadius: "50%", background: "var(--text)", boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          transform: `scale(${drag ? 1.25 : hover ? 1.1 : 1})`, transition: t,
        }}
      />
      <AnimatePresence>
        {(drag || hover) && format && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={spring.snap}
            className="mono"
            style={{
              position: "absolute", bottom: 26, left: `${frac * 100}%`, x: "-50%", padding: "3px 7px", borderRadius: 7,
              background: "var(--text)", color: "var(--bg)", fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap",
            }}
          >{format(value)}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Label + value line over a slider. */
export function Field({ label, hint, children, right }: { label: ReactNode; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 560 }}>{label}</span>
        {right}
      </div>
      {children}
      {hint && <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// ── Loader ────────────────────────────────────────────────────────────────
/** Three bars breathing out of phase — Flux's loading mark. */
export function Loader({ size = 18, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} style={{ display: "inline-flex", alignItems: "end", gap: size * 0.14, height: size }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
          style={{ width: size * 0.2, height: size, borderRadius: size, background: "var(--accent)", transformOrigin: "bottom", display: "block" }}
        />
      ))}
    </span>
  );
}

// ── Empty / feedback state ─────────────────────────────────────────────────
export function EmptyState({ title, body, action, kind = "empty" }: { title: string; body?: ReactNode; action?: ReactNode; kind?: "empty" | "error" | "loading" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: ease.out }}
      style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 14, padding: "48px 24px", color: "var(--text-2)" }}
    >
      {kind === "loading" ? <Loader size={26} /> : <Sleeves error={kind === "error"} />}
      <div className="display" style={{ fontSize: 26, color: "var(--text)" }}>{title}</div>
      {body && <div style={{ maxWidth: 380, fontSize: 14 }}>{body}</div>}
      {action}
    </motion.div>
  );
}

/** Two record sleeves drifting apart — the empty-state mark. */
function Sleeves({ error }: { error?: boolean }) {
  return (
    <svg width="92" height="64" viewBox="0 0 92 64" aria-hidden>
      <motion.rect
        x="8" y="10" width="44" height="44" rx="6" fill="var(--surface-3)"
        animate={error ? { rotate: [0, -4, 3, -2, 0] } : { rotate: [-6, -3, -6] }}
        transition={error ? { duration: 0.6 } : { duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: "30px", originY: "32px" }}
      />
      <motion.g animate={{ x: [0, 4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
        <circle cx="58" cy="32" r="22" fill="none" stroke="var(--line-2)" strokeWidth="1.5" />
        <circle cx="58" cy="32" r="7" fill={error ? "var(--danger)" : "var(--accent)"} />
      </motion.g>
    </svg>
  );
}

// ── Menu (popover with nested pages) ───────────────────────────────────────
export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  /** opens a nested page instead of acting */
  sub?: MenuItem[];
  subTitle?: string;
  danger?: boolean;
  disabled?: boolean;
  /** keep the menu open after selecting */
  keep?: boolean;
}

const MenuCtx = createContext<{ close: () => void } | null>(null);
export const useMenu = () => useContext(MenuCtx);

export function Menu({ anchor, items, onClose, width = 240 }: { anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void; width?: number }) {
  const [stack, setStack] = useState<{ title?: string; items: MenuItem[] }[]>([{ items }]);
  const [dir, setDir] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; ox: string; oy: string } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const below = r.bottom + 8 + 300 < vh;
    const x = Math.min(vw - width - 12, Math.max(12, r.right - width));
    const y = below ? r.bottom + 6 : Math.max(12, r.top - 6);
    setPos({ x, y, ox: `${Math.min(width, Math.max(0, r.left + r.width / 2 - x))}px`, oy: below ? "top" : "bottom" });
  }, [anchor, width]);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (stack.length > 1) { setDir(-1); setStack((s) => s.slice(0, -1)); } else onClose();
      }
    };
    document.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDoc, true); window.removeEventListener("keydown", onKey, true); };
  }, [anchor, onClose, stack.length]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [stack.length, pos]);
  const page = stack[stack.length - 1];
  const onKeyNav = (e: RKeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === "ArrowLeft" && stack.length > 1) { e.preventDefault(); setDir(-1); setStack((s) => s.slice(0, -1)); }
  };
  if (!pos) return null;
  return createPortal(
    <MenuCtx.Provider value={{ close: onClose }}>
      <motion.div
        ref={box}
        role="menu"
        onKeyDown={onKeyNav}
        initial={{ opacity: 0, scale: 0.92, y: pos.oy === "top" ? -6 : 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.14 } }}
        transition={spring.snap}
        style={{
          position: "fixed", left: pos.x, ...(pos.oy === "top" ? { top: pos.y } : { bottom: window.innerHeight - pos.y }),
          width, zIndex: 80, transformOrigin: `${pos.ox} ${pos.oy}`,
          background: "var(--bg-raise)", border: "1px solid var(--line)", borderRadius: 16, padding: 6,
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <motion.div layout transition={spring.soft}>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={stack.length}
              custom={dir}
              variants={{
                in: (d: number) => ({ x: d * 40, opacity: 0 }),
                at: { x: 0, opacity: 1 },
                out: (d: number) => ({ x: d * -40, opacity: 0 }),
              }}
              initial="in" animate="at" exit="out"
              transition={{ duration: 0.22, ease: ease.out }}
            >
              {page.title && (
                <button
                  role="menuitem"
                  onClick={() => { setDir(-1); setStack((s) => s.slice(0, -1)); }}
                  style={menuRow(false)}
                >
                  <I.back size={18} /> <span style={{ fontWeight: 650 }}>{page.title}</span>
                </button>
              )}
              {page.items.map((it, k) => (
                <button
                  key={k}
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    if (it.sub) { setDir(1); setStack((s) => [...s, { title: it.subTitle ?? String(it.label), items: it.sub! }]); return; }
                    it.onSelect?.();
                    if (!it.keep) onClose();
                  }}
                  style={menuRow(!!it.danger, it.disabled)}
                >
                  <span style={{ width: 20, display: "grid", placeItems: "center", opacity: 0.8 }}>{it.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{it.label}</span>
                  {it.sub && <I.chevron size={16} style={{ opacity: 0.5 }} />}
                </button>
              ))}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </MenuCtx.Provider>,
    document.body,
  );
}

const menuRow = (danger: boolean, disabled?: boolean): CSSProperties => ({
  display: "flex", alignItems: "center", gap: 10, width: "100%", height: 40, padding: "0 10px",
  border: 0, background: "transparent", borderRadius: 10, fontSize: 14, color: danger ? "var(--danger)" : "var(--text)",
  opacity: disabled ? 0.4 : 1,
});

/** Hook for a menu anchored to a button: returns [open, bind, menu element]. */
export function useMenuButton(items: () => MenuItem[], width?: number) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const el = (
    <AnimatePresence>
      {anchor && <Menu key="m" anchor={anchor} items={items()} onClose={close} width={width} />}
    </AnimatePresence>
  );
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const t = e.currentTarget;
    setAnchor((a) => (a ? null : t));
  };
  return { open: !!anchor, toggle, menu: el, close };
}

// ── Press feedback ─────────────────────────────────────────────────────────
/** A button that squashes on press and springs back past rest. */
export function PressButton({
  children, className = "icon-btn", style, onClick, label, on, size = 40, disabled, ...rest
}: {
  children: ReactNode; className?: string; style?: CSSProperties; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  label: string; on?: boolean; size?: number; disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "style">) {
  return (
    <motion.button
      className={className}
      aria-label={label}
      title={label}
      aria-pressed={on === undefined ? undefined : on}
      data-on={on ? "true" : undefined}
      disabled={disabled}
      whileTap={{ scale: 0.86 }}
      transition={spring.pop}
      onClick={onClick}
      style={{ width: size, height: size, ...style }}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}

// ── Section heading used across views ──────────────────────────────────────
export function ViewTitle({ eyebrow, title, right }: { eyebrow?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div>}
        <motion.h1
          className="display"
          initial={{ clipPath: "inset(0 0 100% 0)", y: 18 }}
          animate={{ clipPath: "inset(0 0 -10% 0)", y: 0 }}
          transition={{ duration: 0.7, ease: ease.out }}
          style={{ margin: 0, fontSize: "clamp(38px, 6vw, 68px)" }}
        >{title}</motion.h1>
      </div>
      {right}
    </header>
  );
}

// ── Knob ──────────────────────────────────────────────────────────────────
// A rotary control for the sound tools. Drag up/down (Shift for fine), scroll,
// arrow keys, double-click to reset. The arc follows the hand exactly while
// dragging and springs when the value changes from elsewhere (a preset).
export function Knob({
  label, value, min, max, step = 0.01, onChange, format, center, reset, size = 68,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  format: (v: number) => string; center?: number; reset?: number; size?: number;
}) {
  const [drag, setDrag] = useState(false);
  const start = useRef({ y: 0, v: 0 });
  const clampV = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const frac = (Math.min(max, Math.max(min, value)) - min) / (max - min);
  const c0 = center !== undefined ? (center - min) / (max - min) : 0;
  const R = 26, C = 2 * Math.PI * R, SWEEP = 0.75;
  const lo = Math.min(c0, frac), hi = Math.max(c0, frac);
  const angle = -135 + frac * 270;
  const active = Math.abs(frac - c0) > 0.004;
  const ease = drag ? "none" : "stroke-dasharray var(--t3) var(--ease-out), stroke-dashoffset var(--t3) var(--ease-out), transform var(--t3) var(--ease-spring)";
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6, width: size + 16, userSelect: "none" }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={+value.toFixed(3)}
        aria-valuetext={format(value)}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, v: value }; setDrag(true); }}
        onPointerMove={(e) => { if (drag) onChange(clampV(start.current.v + ((start.current.y - e.clientY) / (e.shiftKey ? 900 : 180)) * (max - min))); }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
        onDoubleClick={() => onChange(reset ?? center ?? min)}
        onWheel={(e) => onChange(clampV(value - Math.sign(e.deltaY) * step * (e.shiftKey ? 1 : 4)))}
        onKeyDown={(e) => {
          const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          onChange(clampV(value + d * step * (e.shiftKey ? 10 : 1)));
        }}
        style={{ position: "relative", width: size, height: size, cursor: "ns-resize", touchAction: "none", borderRadius: "50%" }}
      >
        <svg width={size} height={size} viewBox="0 0 68 68" style={{ display: "block", transform: "rotate(135deg)" }}>
          <circle cx="34" cy="34" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${C * SWEEP} ${C}`} />
          <circle
            cx="34" cy="34" r={R} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, C * SWEEP * (hi - lo))} ${C}`} strokeDashoffset={-C * SWEEP * lo}
            style={{ transition: ease, opacity: active ? 1 : 0 }}
          />
        </svg>
        <div
          style={{
            position: "absolute", inset: 11, borderRadius: "50%", transform: `rotate(${angle}deg) scale(${drag ? 0.96 : 1})`, transition: ease,
            background: "linear-gradient(160deg, var(--surface-3), var(--surface))", border: "1px solid var(--line-2)",
            boxShadow: "0 6px 14px -6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          <span style={{ position: "absolute", left: "50%", top: 5, width: 3, height: 9, marginLeft: -1.5, borderRadius: 3, background: active ? "var(--accent)" : "var(--text-2)", transition: "background-color var(--t2)" }} />
        </div>
      </div>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        <div className="mono" style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--text-3)", transition: "color var(--t2)" }}>{format(value)}</div>
      </div>
    </div>
  );
}

/** A titled card used by the tool views. */
export function Card({ title, hint, right, children, style }: { title?: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="card" style={style}>
      {(title || right) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: hint ? 4 : 16 }}>
          <div className="card-title">{title}</div>
          {right}
        </header>
      )}
      {hint && <div className="faint" style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.45 }}>{hint}</div>}
      {children}
    </section>
  );
}

/** Pill chip: a choice among several, or a small action. */
export function Chip({ on, onClick, children, title, tone }: { on?: boolean; onClick?: () => void; children: ReactNode; title?: string; tone?: "danger" }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={spring.pop}
      onClick={onClick}
      title={title}
      aria-pressed={on}
      style={{
        height: 34, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
        background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--on-accent)" : tone === "danger" ? "var(--danger)" : "var(--text)",
        border: `1px solid ${on ? "transparent" : "var(--line)"}`, transition: "background-color var(--t2), color var(--t2)",
      }}
    >{children}</motion.button>
  );
}
