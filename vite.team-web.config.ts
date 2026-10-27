import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {resolve} from 'node:path';

export default defineConfig({
  base: '/team/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-team-web',
    emptyOutDir: true,
    rollupOptions: {input: resolve('team-web.html')},
  },
});
