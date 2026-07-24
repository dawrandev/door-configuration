import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
