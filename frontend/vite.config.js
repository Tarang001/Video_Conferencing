import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Multi-page app configuration
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        room: resolve(__dirname, 'room.html')
      }
    }
  },
  // Development server configuration
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Flask backend during development
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      // Proxy Socket.IO to Flask backend
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true
      }
    }
  }
})
