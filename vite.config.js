import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5175,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["three"],
        },
      },
    },
  },
});
