import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Use the TypeScript source of @docstruct/shared during development.
    conditions: ['development'],
  },
  server: {
    port: 5173,
    proxy: {
      // The API, including signed storage URLs, is served under /api on the same origin.
      '/api': { target: `http://localhost:${process.env.DOCSTRUCT_API_PORT ?? 4000}`, changeOrigin: false },
    },
  },
});
