import { defineConfig } from 'vitest/config';

/**
 * Tests run against the source directly — no React plugin, because nothing
 * under test renders anything. The suites cover the pure maths (the recolour
 * passes, the homography, the trim geometry) and the two stores, all of which
 * are plain TypeScript.
 *
 * The default environment is `node`; the two suites that need `localStorage`
 * and `window` opt into jsdom with a `@vitest-environment jsdom` docblock of
 * their own, so the pure-maths suites pay nothing for a DOM they never touch.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
