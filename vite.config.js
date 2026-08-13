import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/drone-path-optimization/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30
            },
            {
              name: 'three-vendor',
              test: /node_modules[\\/](@react-three|postprocessing|three)[\\/]/,
              priority: 20
            }
          ]
        }
      }
    }
  },
  test: {
    environment: 'node',
    restoreMocks: true,
    setupFiles: ['./src/setupTests.js']
  }
});
