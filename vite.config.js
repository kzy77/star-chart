import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径，兼容Cloudflare Pages
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  optimizeDeps: {
    exclude: ['@rollup/rollup-linux-x64-gnu']
  },
  server: {
    open: true,
    proxy: {
      // Pixiv图片代理
      '/image-proxy/pixiv': {
        target: 'https://i.pixiv.re',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy\/pixiv/, '')
      },
      // DuckMo API代理
      '/api/duckmo': {
        target: 'https://api.mossia.top',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/duckmo/, '/duckMo')
      },
      // 通用图片代理
      '/image-proxy': {
        target: 'https://i.imgur.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy/, '')
      }
    }
  }
});
