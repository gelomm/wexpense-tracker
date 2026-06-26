import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/wexpense-tracker/',   // <-- must match your repository name
  server: { port: 3000 },
});