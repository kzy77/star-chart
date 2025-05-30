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
      // Pixiv图片代理 - 处理完整路径
      '/api/image-proxy/pixiv/': {
        target: 'https://i.pixiv.re/',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const targetPath = req.url.replace(/^\/api\/image-proxy\/pixiv\//, '');
            console.log('🔄 代理Pixiv图片请求:', req.url, '→', options.target + targetPath);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ Pixiv代理错误:', err);
            res.writeHead(500, {
              'Content-Type': 'text/plain'
            });
            res.end('Pixiv代理错误: ' + err.message);
          });
        },
        rewrite: (path) => {
          const result = path.replace(/^\/api\/image-proxy\/pixiv\//, '');
          console.log('⚙️ Pixiv重写路径:', path, '→', result);
          return result;
        }
      },
      // DuckMo API代理
      '/api/duckmo': {
        target: 'https://api.mossia.top',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('🔄 代理API请求:', req.url, '→', options.target + '/duckMo');
          });
        },
        rewrite: (path) => {
          return '/duckMo';
        }
      },
      // 通用图片代理 (仅处理非Pixiv图片)
      '/api/image-proxy/': {
        target: 'https://i.imgur.com/',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            if (!req.url.includes('/pixiv/')) {
              console.log('🔄 代理通用图片请求:', req.url, '→', options.target + req.url.replace(/^\/api\/image-proxy\//, ''));
            }
          });
        },
        rewrite: (path) => {
          // 如果是Pixiv路径，不在这里处理
          if (path.includes('/pixiv/')) {
            return path;
          }
          const result = path.replace(/^\/api\/image-proxy\//, '');
          console.log('⚙️ 通用图片重写路径:', path, '→', result);
          return result;
        }
      },
      // 兼容旧的路径格式 - 便于过渡
      '/image-proxy/pixiv/': {
        target: 'https://i.pixiv.re/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy\/pixiv\//, '')
      },
      '/image-proxy/': {
        target: 'https://i.imgur.com/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy\//, '')
      }
    }
  }
});
