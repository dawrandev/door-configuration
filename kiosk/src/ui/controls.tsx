import type { CSSProperties, ReactNode } from 'react';
import { COLOR, FONT, RADIUS, RADIUS_SM, TYPE } from '../design/tokens';
import { Ornament } from './Ornament';

/**
 * The chrome. It recedes so the door carries the colour (SPEC §9): ink on
 * limestone, one brass accent, and the accent only ever marks a choice. Sizes
 * are a fixed web scale now — refined, not scaled off a kiosk canvas.
 */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="dc-lift"
      style={{
        minHeight: 54,
        padding: '0 30px',
        background: COLOR.ink,
        color: COLOR.onInk,
        border: 'none',
        borderRadius: RADIUS,
        fontFamily: FONT.display,
        fontSize: '1.05rem',
        letterSpacing: '-0.01em',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        boxShadow: disabled ? 'none' : '0 10px 26px rgba(35,32,27,.16)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 44,
        padding: '0 18px',
        background: 'transparent',
        border: `1px solid ${COLOR.lineStrong}`,
        borderRadius: RADIUS_SM,
        ...TYPE.small,
        color: COLOR.ink,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Mono eyebrow — the shop-floor label above a heading. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...TYPE.label, color: COLOR.brass, ...style }}>{children}</div>;
}

/** A step heading: eyebrow with the step index, then the serif title. */
export function StepHeader({ kicker, title, step }: { kicker: string; title: string; step: string }) {
  return (
    <div>
      <Eyebrow>
        {kicker} <span style={{ color: COLOR.inkSoft }}>· {step}</span>
      </Eyebrow>
      <h2 style={{ ...TYPE.h1, margin: '10px 0 0', color: COLOR.ink }}>{title}</h2>
    </div>
  );
}

export function SelectedMark({ width = 44 }: { width?: number }) {
  return <Ornament width={width} strokeWidth={3.4} />;
}

/** The wordmark — the ram's horn beside the workshop name. */
export function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Ornament width={40} strokeWidth={2.4} />
      <div style={{ ...TYPE.label, fontSize: '0.7rem', color: COLOR.ink }}>Qoraqalpoq&nbsp;eshik</div>
    </div>
  );
}

/**
 * The top bar carried by the configurator screens: a back button and the
 * language cycler. On a door stage the controls sit on a soft plate to stay
 * legible over the render.
 */
export function TopBar({
  onBack,
  backLabel,
  lang,
  onCycleLang,
  floating = false,
}: {
  onBack?: () => void;
  backLabel?: string;
  lang: string;
  onCycleLang: () => void;
  floating?: boolean;
}) {
  const plate: CSSProperties = floating
    ? { background: 'rgba(248,246,241,.82)', border: `1px solid ${COLOR.line}`, backdropFilter: 'blur(6px)' }
    : {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <GhostButton onClick={onBack} style={{ padding: '0 16px 0 12px', ...plate }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>‹</span>
            {backLabel}
          </GhostButton>
        )}
      </div>
      <button
        onClick={onCycleLang}
        style={{
          minHeight: 44,
          minWidth: 52,
          padding: '0 14px',
          background: 'transparent',
          border: `1px solid ${COLOR.lineStrong}`,
          borderRadius: RADIUS_SM,
          ...TYPE.label,
          fontSize: '0.72rem',
          color: COLOR.ink,
          cursor: 'pointer',
          ...plate,
        }}
      >
        {lang.toUpperCase()}
      </button>
    </div>
  );
}
