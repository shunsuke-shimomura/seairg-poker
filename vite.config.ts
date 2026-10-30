import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base を相対にして、GitHub Pages のサブパスやローカルの file:// でも動くようにする
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
