import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Electron에서 로컬 파일로 로드될 때 절대 경로(/assets) 대신 상대 경로(./assets)를 사용하도록 강제함
  resolve: {
    // alias: { '@': path.resolve(__dirname, './src') }, // 소스 파일이 루트에 있으므로 src alias 제거
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  }
});