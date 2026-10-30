import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite proxies /graphql (HTTP + WebSocket) to the API so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/graphql': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
