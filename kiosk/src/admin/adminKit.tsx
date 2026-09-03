import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { COLOR, FONT, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { PrimaryButton, GhostButton } from '../ui/controls';
import { Ornament } from '../ui/Ornament';
import type { TrimRole } from '../catalog/types';

/**
 * The bench's own shared kit — everything DoorBench.tsx and RoomBench.tsx
 * both need but the customer side has no use for (corner/point handles, a
 * dimension readout, a nudge pad, a segmented toggle). `primaryBtn`'s and
 * `ghostBtn`'s ACTUAL button chrome is not reinvented here a third time —
 * both wrap the client site's own PrimaryButton/GhostButton (ui/controls.tsx)
 * so the bench and the showroom share one real implementation, not three
 * drifting copies of the same idea.
 */

/** A muted rust, not a bright web red — the one place the warm palette needs
 *  a "stop" colour, kept in the same family instead of a jarring foreign hue. */
export const DANGER = { text: '#A6432C', border: 'rgba(166,67,44,.35)', bg: 'rgba(166,67,44,.07)' };

/** Every trim-piece role OFFERED for a new piece, in order — shared between
 *  RoomBench (marking which pieces a room's architrave actually has) and
 *  DoorBench (marking which of those a given door comes with, and tracing
 *  its own). `footL`/`footR` stay valid TrimRole values (older, already-
 *  published rooms keep whatever foot pieces they were measured with — see
 *  `ROLE_META` below) but are no longer offered for a NEW piece; this shop's
 *  own doors don't use them. */
export const ROLE_ORDER: TrimRole[] = ['shaft', 'crown'];
/** Muted, editorial tones — not neon — so the box outlines and their row
 *  swatches sit comfortably in the same warm, printed-catalogue palette as
 *  the rest of the bench, while staying five clearly distinct hues. */
export const ROLE_META: Record<TrimRole, { label: string; color: string }> = {
  shaft: { label: 'Yelka', color: '#C0952E' },
  crown: { label: 'Korona', color: '#A83D6B' },
  footL: { label: 'Chap oyoq', color: '#1E8FA0' },
  footR: { label: 'O‘ng oyoq', color: '#4C8C4A' },
  extra: { label: 'Boshqa', color: '#B85A2E' },
};

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="dc-admin-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: `1px solid ${COLOR.line}`, fontFamily: FONT.sans }}>
      {children}
    </div>
  );
}
/** The scrollable body of a Panel, everything above the sticky footer. */
export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>;
}
/** The commit action, pinned to the bottom of the panel — always in reach,
 *  never buried at the end of a long scroll. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return <div style={{ padding: '14px 24px', borderTop: `1px solid ${COLOR.line}`, background: '#fff' }}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div style={{ ...TYPE.label, fontSize: 11, color: COLOR.inkSoft, marginTop: 18, marginBottom: 6 }}>{children}</div>;
}

/** A named, bordered group — the fix for a bench panel that used to read as
 *  one undifferentiated stack of Label/control pairs. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16, background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ ...TYPE.label, fontSize: 11, color: COLOR.brass }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: COLOR.line }} />
      </div>
      {children}
    </div>
  );
}

export const inp: React.CSSProperties = { width: '100%', minHeight: TOUCH_MIN, marginTop: 6, padding: '9px 10px', borderRadius: RADIUS_SM, background: '#fff', color: COLOR.ink, border: `1px solid ${COLOR.lineStrong}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };

/** Full-width primary commit action — the client site's own PrimaryButton,
 *  not a repaint of it. */
export function AdminPrimaryButton({ children, onClick, disabled, style }: { children: ReactNode; onClick: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <PrimaryButton onClick={onClick} disabled={disabled} style={{ width: '100%', minHeight: 48, fontSize: '0.95rem', ...style }}>
      {children}
    </PrimaryButton>
  );
}
/** Full-width secondary action — the client site's own GhostButton. */
export function AdminGhostButton({ children, onClick, disabled, style }: { children: ReactNode; onClick: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <GhostButton onClick={onClick} disabled={disabled} style={{ width: '100%', justifyContent: 'center', ...style }}>
      {children}
    </GhostButton>
  );
}

/** A text-scaled link, but a real touch target underneath — a bare 13px
 *  line of text is what a mouse cursor forgives and a finger does not. */
export const linkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: TOUCH_MIN, background: 'none', border: 'none', color: COLOR.inkSoft, cursor: 'pointer', fontSize: 13, padding: '0 4px', margin: '0 -4px', fontFamily: 'inherit' };

export function Seg({ opts, value, onPick }: { opts: { id: string; label: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            style={{
              flex: 1, minHeight: TOUCH_MIN, padding: '9px 6px', borderRadius: RADIUS_SM, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
              background: on ? 'rgba(143,113,69,.1)' : 'transparent', color: COLOR.ink,
              border: `1px solid ${on ? COLOR.brass : COLOR.lineStrong}`, fontWeight: on ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pad({ onNudge }: { onNudge: (dx: number, dy: number) => void }) {
  const b = (t: string, dx: number, dy: number) => (
    <button onClick={() => onNudge(dx, dy)} style={{ background: '#fff', border: `1px solid ${COLOR.lineStrong}`, borderRadius: RADIUS_SM, color: COLOR.ink, cursor: 'pointer', fontSize: 13, minHeight: TOUCH_MIN, padding: 0 }}>{t}</button>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
      <span />{b('▲', 0, -2)}<span />
      {b('◀', -2, 0)}<span />{b('▶', 2, 0)}
      <span />{b('▼', 0, 2)}<span />
    </div>
  );
}

/**
 * A drag corner. The grabbable area is TOUCH_MIN (44px) even though the
 * visible dot stays small — a hand marking corners on a photo needs to land
 * on it, not near it.
 */
export function Handle({ x, y, color = COLOR.brass, onPointerDown, onDoubleClick }: { x: number; y: number; color?: string; onPointerDown: (e: React.PointerEvent) => void; onDoubleClick?: () => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', left: x - TOUCH_MIN / 2, top: y - TOUCH_MIN / 2, width: TOUCH_MIN, height: TOUCH_MIN, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 999, background: color, border: '2px solid #fff', boxShadow: '0 1px 6px rgba(35,32,27,.35)', pointerEvents: 'none' }} />
    </div>
  );
}

/** Live fraction/pixel readout for whichever box is being dragged. */
export function DimHUD({ rect, w, h }: { rect: { x: number; y: number; w: number; h: number }; w: number; h: number }) {
  const px = (f: number, dim: number) => Math.round(f * dim);
  return (
    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)', border: `1px solid ${COLOR.line}`, color: COLOR.ink, padding: '5px 9px', borderRadius: RADIUS_SM, ...TYPE.data, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      x {rect.x.toFixed(3)} ({px(rect.x, w)}px) · y {rect.y.toFixed(3)} ({px(rect.y, h)}px) · w {rect.w.toFixed(3)} ({px(rect.w, w)}px) · h {rect.h.toFixed(3)} ({px(rect.h, h)}px)
    </div>
  );
}

/**
 * An inline "are you sure" strip, not a modal. It swaps in for whatever
 * triggered it (a delete button) rather than floating a dialog over the
 * photo, so it can never sit on top of — or intercept a pointer meant for —
 * a corner/point drag target elsewhere on screen.
 */
export function ConfirmBar({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, padding: '0 4px' }}>
      <span style={{ flex: 1, fontSize: 12, color: DANGER.text }}>{message}</span>
      <button onClick={onCancel} style={{ minHeight: TOUCH_MIN, padding: '0 12px', borderRadius: RADIUS_SM, border: `1px solid ${COLOR.lineStrong}`, background: 'transparent', color: COLOR.ink, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
        Bekor qilish
      </button>
      <button onClick={onConfirm} style={{ minHeight: TOUCH_MIN, padding: '0 12px', borderRadius: RADIUS_SM, border: `1px solid ${DANGER.border}`, background: DANGER.text, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
        Ha, o‘chirish
      </button>
    </div>
  );
}

/**
 * A minimal toast — one fixed slot, bottom-centre, ink-on-limestone, gone on
 * its own after a couple of seconds. No queue: the bench never fires two of
 * these close enough together to need one.
 */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    window.clearTimeout(timer.current);
    setMsg(m);
    timer.current = window.setTimeout(() => setMsg(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div
          style={{
            position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 1000,
            background: COLOR.ink, color: COLOR.onInk, padding: '12px 22px', borderRadius: 999,
            ...TYPE.small, boxShadow: '0 10px 26px rgba(35,32,27,.28)', pointerEvents: 'none',
            animation: 'fadeUp .32s cubic-bezier(.22,.61,.36,1) both',
          }}
        >
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export function useToast() {
  return useContext(ToastCtx);
}

/** The persistent masthead — identity and the one-tap way back to the
 *  client site, present on every admin screen including the benches, so
 *  staff are never more than a glance away from either. */
export function Masthead({ onDone }: { onDone?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${COLOR.line}`, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Ornament width={26} strokeWidth={2.2} />
        <span style={{ ...TYPE.label, fontSize: '0.68rem', color: COLOR.ink }}>Ustaxona&nbsp;·&nbsp;Boshqaruv</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onDone && <button onClick={onDone} style={linkBtn}>← Ro‘yxatga qaytish</button>}
        <a href="#/" style={clientLinkBtn}>Client sayt →</a>
      </div>
    </div>
  );
}
const clientLinkBtn: React.CSSProperties = { minHeight: TOUCH_MIN, padding: '0 16px', display: 'flex', alignItems: 'center', borderRadius: RADIUS, border: `1px solid ${COLOR.lineStrong}`, color: COLOR.ink, textDecoration: 'none', fontSize: 13, fontFamily: 'inherit' };

/** One "+ role" pill — a trim role not yet in use, offered as a one-tap way
 *  to add it. Shared between RoomBench (a room's own architrave) and
 *  DoorBench (a door's own, once traced on its own photo) — the same chip
 *  either way, just fed a different role list and add handler. */
export function RoleChip({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, minHeight: TOUCH_MIN, padding: '7px 14px', borderRadius: 999, fontFamily: 'inherit',
        border: `1px solid ${disabled ? COLOR.line : color}`, background: 'transparent',
        color: disabled ? COLOR.inkSoft : COLOR.ink, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      + {label}
    </button>
  );
}

/** The nudge pad for whatever's currently selected — move it, and (unless
 *  `sizeless`, for a free-outline trim piece with no single "size" of its
 *  own) resize it, one small step per tap. */
export function MoveResize({ onMove, onSize, sizeless }: { onMove: (dx: number, dy: number) => void; onSize: (dx: number, dy: number) => void; sizeless?: boolean }) {
  const cell = (t: string, fn: () => void) => (
    <button onClick={fn} style={{ background: '#fff', border: `1px solid ${COLOR.lineStrong}`, borderRadius: RADIUS_SM, color: COLOR.ink, cursor: 'pointer', fontSize: 13, minHeight: TOUCH_MIN, padding: 0 }}>{t}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 }}>O‘rni</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
          <span />{cell('▲', () => onMove(0, -8))}<span />
          {cell('◀', () => onMove(-8, 0))}<span />{cell('▶', () => onMove(8, 0))}
          <span />{cell('▼', () => onMove(0, 8))}<span />
        </div>
      </div>
      {!sizeless && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 }}>O‘lchami</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {cell('En −', () => onSize(-8, 0))}{cell('En +', () => onSize(8, 0))}
            {cell('Bo‘y −', () => onSize(0, -8))}{cell('Bo‘y +', () => onSize(0, 8))}
          </div>
        </div>
      )}
    </div>
  );
}
