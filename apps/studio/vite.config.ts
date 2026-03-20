import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  server: {
    port: 5174,
  },
});
