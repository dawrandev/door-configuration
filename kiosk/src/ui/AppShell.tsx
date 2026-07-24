import type { ReactNode } from 'react';
import { COLOR } from '../design/tokens';

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
    </div>
  );
}
