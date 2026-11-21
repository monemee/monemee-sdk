import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Im Dev-Modus gehen /api und /monemee an den Express-Server
const server = 'http://localhost:3001';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': server, '/monemee': server } }
});
