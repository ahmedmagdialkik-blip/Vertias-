import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'portal-dev-rewrite',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const url = (req.url || '').split('?')[0].replace(/\/$/, '');
            if (
              url === '/admin' ||
              url === '/eb' ||
              url === '/staff' ||
              url === '/pass' ||
              url === '/scanner' ||
              url === '/invite' ||
              url.startsWith('/invite/') ||
              url === '/eb-signup' ||
              url === '/setup' ||
              url === '/login' ||
              url === '/signup' ||
              url === '/account' ||
              url === '/apply'
            ) {
              req.url = '/portal/index.html';
            }
            next();
          });
        },
      },
      // Adds the admin-panel content loader to the public page only (not the portal).
      {
        name: 'inject-cms',
        transformIndexHtml: {
          order: 'pre' as const,
          handler(_html: string, ctx: {path: string}) {
            if (ctx.path.startsWith('/portal')) return [];
            return [{tag: 'script', attrs: {type: 'module', src: '/src/cms.js'}, injectTo: 'body' as const}];
          },
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        // Two pages: the public site (index.html) and the team portal (/admin, /login, /account)
        input: {
          main: path.resolve(__dirname, 'index.html'),
          portal: path.resolve(__dirname, 'portal/index.html'),
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
