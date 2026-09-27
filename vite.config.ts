import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const INPUT = process.env.INPUT || 'mcp-app.html';
const isDevMode = process.env.NODE_ENV === 'development';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    sourcemap: isDevMode ? 'inline' : undefined,
    cssMinify: !isDevMode,
    minify: !isDevMode,
    rollupOptions: {
      input: INPUT
    },
    outDir: 'dist',
    emptyOutDir: false
  }
});
