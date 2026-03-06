import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5280,
    open: true,
    https: {},
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'https://api.wildwoodworks.com.co/api/',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
