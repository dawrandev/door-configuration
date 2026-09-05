/**
 * Whether this tab is the showroom panel or an ordinary browser.
 *
 * Opted into explicitly with `?kiosk` in the URL — never guessed from the
 * screen size. The same build serves a 32" touch monitor on the shop floor, a
 * salesperson's laptop and a customer's phone, and the only one of those that
 * should have its scrolling taken away and its browser chrome hidden is the
 * one someone deliberately set up that way.
 *
 * A query parameter rather than a hash, because the hash is already the router
 * (`#/admin`) and would be rewritten out from under this on the first
 * navigation.
 */
export const KIOSK = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('kiosk');

/**
 * Lock the page the way index.css's `.kiosk-locked` rules expect.
 *
 * Those rules have existed for a long time with nothing anywhere that set the
 * class, so the hardening they describe was never actually on.
 */
export function applyKioskLock() {
  if (KIOSK) document.documentElement.classList.add('kiosk-locked');
}

/**
 * Go fullscreen, if the browser will allow it.
 *
 * Must be called from inside a user gesture — browsers reject the request
 * otherwise — which is why it hangs off the attract screen's start button
 * rather than running on load. Rejection is normal and ignored: an iframe, a
 * denied permission, or a browser that simply does not offer it are all fine,
 * and the app works identically without it.
 */
export function enterFullscreen() {
  if (!KIOSK || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.().catch(() => {
    /* not permitted here — the app does not depend on it */
  });
}
