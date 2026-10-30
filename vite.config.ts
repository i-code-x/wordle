import { defineConfig } from 'vite';

// The web app lives in src/web; the production build is served by Express from dist/web.
export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
