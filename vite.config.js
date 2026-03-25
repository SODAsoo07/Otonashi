import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true'

export default defineConfig({
  base: isVercel ? '/' : './',
  plugins: [react()],
  build: {
    outDir: 'dist',
  }
})
