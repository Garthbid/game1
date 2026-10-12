import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true },
  build: { chunkSizeWarningLimit: 800 },
});
