import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /v1 calls go to the Spring Boot backend so the browser never needs CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
