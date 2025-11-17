import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, 'frontend.env'), override: true });

const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT) || 5173;
const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:3001';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    port: devServerPort,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
      ,
      '/runtime-env.js': {
        target: backendTarget,
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: devServerPort
  }
})
