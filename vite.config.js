import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径，兼容Cloudflare Pages
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    open: true
  }
});
