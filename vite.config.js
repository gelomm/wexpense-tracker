import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/wexpense-tracker/', // <-- same as your repo name
  server: { port: 3000 },
});