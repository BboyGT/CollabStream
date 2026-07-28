import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts,
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('qrcode')) return 'qrcode'
          return undefined
        },
      },
    },
  },
})
