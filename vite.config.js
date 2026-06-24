import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Plugin to copy index.html to 404.html after build
function copy404() {
  return {
    name: 'copy-404',
    writeBundle() {
      const src = path.resolve(__dirname, 'dist', 'index.html');
      const dest = path.resolve(__dirname, 'dist', '404.html');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('✅ 404.html copied from index.html');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copy404()],
  base: '/wexpense-tracker/', // <-- your repo name
  server: { port: 3000 },
});