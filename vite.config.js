import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',   // or '/' because we use HashRouter, no need for subpath
  server: { port: 3000 },
});