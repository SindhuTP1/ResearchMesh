import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// In dev, Vite proxies /graphql (HTTP + WebSocket) and /api to the API so the browser sees one origin.
//
// `npm run dev:lan` (mode "lan") is for testing from a second laptop on the same Wi-Fi:
//  - listens on every network interface, so other devices can open https://<this-PC's-IP>:5180
//  - serves HTTPS with a self-signed certificate, because browsers only allow the camera and
//    microphone (video/voice calls) on https:// or localhost. Each browser shows a one-time
//    "not secure" warning — choose Advanced → Proceed.
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan';
  return {
    plugins: [react(), ...(lan ? [basicSsl({ name: 'researchmesh-lan' })] : [])],
    server: {
      // 5180, not Vite's default 5173: another local project (Docker) already uses 5173.
      port: 5180,
      strictPort: true,
      host: lan ? true : 'localhost',
      proxy: {
        '/graphql': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
        '/api': { target: 'http://localhost:4000', changeOrigin: true },
      },
    },
  };
});
