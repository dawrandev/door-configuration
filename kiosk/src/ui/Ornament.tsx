import { COLOR, u } from '../design/tokens';

/**
 * Qo'shqor muyiz — the ram's horn.
 *
 * The one signature element (SPEC §9). It is the oldest motif in Karakalpak
 * ornament, it is what our carvers already cut into the doors, and it earns its
 * place by being *ours* rather than by being decoration. It appears only where
 * something is chosen or divided — never as filler — because a mark that shows
 * up everywhere stops meaning anything.
 */
export function Ornament({
  width = 72,
  color = COLOR.brass,
  strokeWidth = 2.6,
  className,
}: {
  width?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 40"
      width={u(width)}
      height={u(width * 0.4)}
      style={{ flex: 'none' }}
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M50 34 C50 22 44 9 30 9 C18 9 12 18 18 24 C22 28 28 26 26 20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M50 34 C50 22 56 9 70 9 C82 9 88 18 82 24 C78 28 72 26 74 20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The horn with a rule running out either side. Used to open a screen. */
export function OrnamentRule({ width = 72 }: { width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: u(22), marginTop: u(26) }}>
      <Ornament width={width} />
      <div style={{ flex: 1, height: 1, background: COLOR.line }} />
    </div>
  );
}
