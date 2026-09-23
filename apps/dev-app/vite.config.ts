import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: [
      {
        find: /^@tschannel\/core$/,
        replacement: resolve(__dirname, '../../packages/core/src/index.ts'),
      },
      {
        find: /^@tschannel\/pubsub-channel$/,
        replacement: resolve(__dirname, '../../packages/pubsub-channel/src/index.ts'),
      },
      {
        find: /^@tschannel\/iframe-channel$/,
        replacement: resolve(__dirname, '../../packages/iframe-channel/src/index.ts'),
      },
    ],
  },
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        iframe: resolve(__dirname, 'iframe.html'),
      },
    },
  },
});
