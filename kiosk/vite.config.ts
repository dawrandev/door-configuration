import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * @fontsource's CSS lists a legacy .woff beside every .woff2. Vite emits both,
 * so twelve files nothing will ever request were being shipped and deployed.
 *
 * Every browser that can run this app already supports woff2: the door leaves
 * are WebP, and woff2 support predates WebP support everywhere it matters. So
 * the fallback is not insurance, it is dead weight — dropped here rather than
 * by hand-writing fifteen @font-face rules to avoid it.
 */
function dropLegacyWoff(): Plugin {
  return {
    name: 'drop-legacy-woff',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css') || !id.includes('fontsource')) return null;
      const out = code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, '');
      return out === code ? null : { code: out, map: null };
    },
  };
}

/** Where `php artisan serve` listens. */
const BACKEND = 'http://127.0.0.1:8000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropLegacyWoff()],
  server: {
    /**
     * Proxy the backend rather than enabling CORS on it.
     *
     * This is a correctness constraint, not a convenience. recolor.ts draws
     * every door into a canvas and reads it back with getImageData, and a
     * canvas that has had a cross-origin image drawn into it is tainted —
     * every read then throws SecurityError. In production Laravel serves the
     * SPA and /storage from one origin, so the question never arises; a dev
     * setup on two ports would be the only place it could, and CORS there
     * would hide the bug until deploy instead of preventing it.
     */
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/storage': { target: BACKEND, changeOrigin: false },
    },
  },
});
