import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['maude-untickled-collectively.ngrok-free.dev'],
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/session': { target: 'http://localhost:3001', changeOrigin: true },
      '/public-host': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth/status': { target: 'http://localhost:3001', changeOrigin: true },
      '/admin': { target: 'http://localhost:3001', changeOrigin: true },
      '/billing': { target: 'http://localhost:3001', changeOrigin: true },
      '/user': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
    },
  },
})
