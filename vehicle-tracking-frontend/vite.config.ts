import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      cors: true,
    },
    define: {
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL),
      'process.env.VITE_WS_URL': JSON.stringify(env.VITE_WS_URL),
    },
  };
});