import { defineConfig } from 'vitest/config'
import vueJsx from '@vitejs/plugin-vue-jsx'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    vueJsx(),
  ],
  build: {
    outDir: './vue/dist',
    emptyOutDir: true,
    minify: 'esbuild',
    lib: {
      entry: './vue/app.tsx',
      formats: ['es'],
      fileName: 'app',
    },
    rollupOptions: {
      external: ['vue', 'vue/jsx-runtime'],
    },
  },
  esbuild: {
    keepNames: true,
  },
  test: {
    name: '@benchmarks/client-nav (vue)',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
