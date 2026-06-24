import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/wexpense-tracker/',  // <-- your repo name with slashes
  server: { port: 3000 },
});