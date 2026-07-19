import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.CRACKLEDATE_API_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
});
