import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    // Spotify only accepts loopback IP literals (not `localhost`), so bind to
    // IPv4 explicitly and fail loudly instead of silently changing ports.
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    // Dev tunnels (cloudflared/ngrok) send their public Host header. Add your
    // own domain here when you use a named tunnel.
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
