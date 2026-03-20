import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  root: './', // Forces Vite to look in the current folder
  base: command === 'build' ? './' : '/',  // './' lets Electron load assets from dist/
  server: {
    port: 5173,  // Default Vite port
    strictPort: true,
    host: '127.0.0.1',
    open: false,
    proxy: {
      // Forward all /api requests to the FastAPI backend
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/setup.js'],
    },
  },
}))
