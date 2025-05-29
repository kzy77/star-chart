import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径，兼容Cloudflare Pages
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // 禁用原生优化以避免平台特定的依赖问题
      context: 'globalThis',
      treeshake: {
        moduleSideEffects: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['@rollup/rollup-linux-x64-gnu']
  },
  server: {
    open: true
  }
});
