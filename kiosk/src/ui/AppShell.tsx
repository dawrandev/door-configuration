import type { ReactNode } from 'react';
import { COLOR, TOUCH_MIN } from '../design/tokens';

/**
 * The app shell.
 *
 * The layout is fluid (see the .dc-* classes and Region): the shell just paints
 * the background and gets out of the way, and each screen decides how it
 * reflows. That is what lets one build serve a wide showroom touch monitor, a
 * tablet and a phone from the same code — there is no fixed canvas being scaled.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: COLOR.bg,
        color: COLOR.ink,
        fontFamily: "'IBM Plex Sans', sans-serif",
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
      <AdminEntry />
    </div>
  );
}

/**
 * A near-invisible way in to the bench, so staff never have to type
 * "#/admin" by hand. Deliberately faint — a customer browsing the showroom
 * has no reason to notice a dim mark in the corner, but staff who know it's
 * there can always find it.
 */
function AdminEntry() {
  return (
    <a
      href="#/admin"
      aria-label="Admin panel"
      style={{
        position: 'fixed',
        right: 0,
        bottom: 0,
        width: TOUCH_MIN,
        height: TOUCH_MIN,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLOR.ink,
        opacity: 0.14,
        textDecoration: 'none',
        fontSize: 16,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      ⚙
    </a>
  );
}
