/**
 * What this file does
 *   Configures Vite, the tool that serves the React web client in development and builds it for release.
 *
 * How it works
 *   - Adds the React and Tailwind CSS plugins.
 *   - Makes '@/...' imports point to the src folder.
 *   - Runs the dev server on port 5173 and forwards /api requests to the API server.
 *
 * Where it fits
 *   Used by `npm run dev` and `npm run build` in apps/web. scripts/dev.mjs sets DOCSTRUCT_API_PORT.
 *   Module: web client setup (owner: Vansh).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Use the TypeScript source of @docstruct/shared during development.
    conditions: ['development'],
  },
  server: {
    port: 5173,
    proxy: {
      // The API, including signed storage URLs, is served under /api on the same origin.
      // Same origin for the browser means no CORS problems in development.
      '/api': { target: `http://localhost:${process.env.DOCSTRUCT_API_PORT ?? 4000}`, changeOrigin: false },
    },
  },
});
