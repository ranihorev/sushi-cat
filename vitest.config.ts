import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/* Deliberately not vite.config.ts — the PWA plugin has nothing to offer a test
   run and generating a service worker for every `npm test` is pure cost. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
