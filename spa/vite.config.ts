import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/core': { target: 'http://localhost:8001', rewrite: (p) => p.replace(/^\/api\/core/, '') },
      '/api/ml': { target: 'http://localhost:8002', rewrite: (p) => p.replace(/^\/api\/ml/, '') },
      '/orthanc': { target: 'http://localhost:8042', rewrite: (p) => p.replace(/^\/orthanc/, '') },
    },
  },
})
