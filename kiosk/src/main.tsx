import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * The typefaces, bundled rather than fetched.
 *
 * index.css used to pull these from fonts.googleapis.com with a CSS @import,
 * which is render-blocking: a showroom machine with no internet did not merely
 * lose its typography, it showed nothing at all until the request timed out.
 * The whole point of this build is that it runs on a monitor in a shop.
 *
 * Only the subsets the three languages need. Greek and Vietnamese ship in the
 * same packages and are deliberately not imported; Fraunces has no Cyrillic at
 * all, which is why FONT.display falls through to IBM Plex Serif for Russian —
 * as it always did, Google served no Cyrillic Fraunces either.
 */
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-500.css';
import '@fontsource/ibm-plex-sans/cyrillic-400.css';
import '@fontsource/ibm-plex-sans/cyrillic-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-500.css';

import './index.css';
import { applyKioskLock } from './kioskMode';
import App from './App.tsx';
import { Admin } from './admin/Admin.tsx';

/**
 * One SPA, two faces, behind hash routes so the static bundle needs no server to
 * route it:
 *   #/       the showroom configurator
 *   #/admin  the workshop bench — manage doors and rooms, add new ones
 *
 * The customer never reaches the bench; staff type the address.
 */
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function Root() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  if (hash.startsWith('#/admin')) return <Admin />;
  return <App />;
}

applyKioskLock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
