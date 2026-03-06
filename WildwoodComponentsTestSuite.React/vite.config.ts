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
        target: 'https://localhost:5291',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
