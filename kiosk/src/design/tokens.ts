import type { CSSProperties } from 'react';

/**
 * Design system — "Ustaxona" (the atelier).
 *
 * A door workshop in Karakalpakstan, presented as a considered object on a
 * limestone-light studio. Warmth comes from a crafted serif (Fraunces) used with
 * restraint; precision comes from a monospaced "spec" voice — a configuration IS
 * a production order, so the numbers and labels read like the shop floor. The
 * ram's horn (qo'shqor muyiz) is the single brass signature.
 *
 * Type is a fixed web scale in rem, capped with clamp — NOT scaled off a kiosk
 * canvas, which is what made headings balloon on a wide screen. `u()` survives
 * only for a little responsive spacing; nothing about type flows through it.
 */

export const CANVAS = { w: 1080, h: 1920 } as const;
export const DESIGN_WIDTH = 1080;

/** Legacy responsive spacing unit. Kept modest — type no longer rides on it. */
export function u(n: number): string {
  return `calc(${n} * var(--u, 1px))`;
}

export const COLOR = {
  /** the page: a cool limestone, lighter and less golden than a "cream" cliché */
  paper: '#F1EEE7',
  /** raised surfaces — control panels, sticky bars */
  panel: '#E9E4DA',
  /** the studio sweep behind a door */
  studio: 'radial-gradient(120% 90% at 50% 22%, #FBFAF7 0%, #EFEBE2 55%, #E4DFD4 100%)',
  /** primary text and near-black fills */
  ink: '#23201B',
  /** secondary text */
  inkSoft: '#746A5C',
  /** text on ink */
  onInk: '#F3EFE6',
  /** the one accent — refined brass */
  brass: '#8F7145',
  brassDeep: '#6E5734',
  /** hairlines */
  line: 'rgba(35,32,27,.11)',
  lineStrong: 'rgba(35,32,27,.22)',

  // ---- back-compat aliases (older screens still import these) ----
  bg: '#F1EEE7',
  bgFlat: '#F1EEE7',
  surface: '#E9E4DA',
  inkMuted: '#746A5C',
  ring: 'rgba(35,32,27,.11)',
} as const;

export const FONT = {
  /** crafted display serif — headings, restrained */
  display: "'Fraunces', 'IBM Plex Serif', serif",
  /** UI body */
  sans: "'IBM Plex Sans', sans-serif",
  /** the shop-floor voice: labels, numbers, spec rows */
  mono: "'IBM Plex Mono', monospace",
  /** alias */
  serif: "'Fraunces', 'IBM Plex Serif', serif",
} as const;

/**
 * The type scale. Applied directly as style objects — refined, web-sized, and
 * responsive by clamp rather than by canvas scaling.
 */
export const TYPE = {
  /** hero — the one big serif moment */
  display: {
    fontFamily: FONT.display,
    fontSize: 'clamp(2.1rem, 1.3rem + 2.7vw, 3.3rem)',
    lineHeight: 1.04,
    letterSpacing: '-0.02em',
    fontWeight: 400,
  },
  h1: {
    fontFamily: FONT.display,
    fontSize: 'clamp(1.6rem, 1.2rem + 1.4vw, 2.2rem)',
    lineHeight: 1.08,
    letterSpacing: '-0.015em',
    fontWeight: 400,
  },
  h2: {
    fontFamily: FONT.display,
    fontSize: 'clamp(1.25rem, 1.05rem + 0.8vw, 1.55rem)',
    lineHeight: 1.12,
    letterSpacing: '-0.01em',
    fontWeight: 400,
  },
  body: {
    fontFamily: FONT.sans,
    fontSize: 'clamp(1rem, 0.96rem + 0.15vw, 1.075rem)',
    lineHeight: 1.55,
    fontWeight: 400,
  },
  small: {
    fontFamily: FONT.sans,
    fontSize: '0.9rem',
    lineHeight: 1.5,
  },
  /** the mono eyebrow / spec label — tracked, uppercase */
  label: {
    fontFamily: FONT.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  /** mono data — prices, dimensions, SKUs */
  data: {
    fontFamily: FONT.mono,
    fontSize: '0.95rem',
    letterSpacing: '0.01em',
  },
} satisfies Record<string, CSSProperties>;

/** Corner radius. Two steps — a tight one for controls, a soft one for cards. */
export const RADIUS = 8;
export const RADIUS_SM = 5;

export const TOUCH_MIN = 44;

export const DURATION = {
  finishFade: 240,
  screenIn: 420,
} as const;
