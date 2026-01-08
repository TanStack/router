import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/angular-router',
  plugins: [angular()],
  resolve: {
    mainFields: ['module'],
  },
  build: {
    target: ['esnext'],
    sourcemap: true,
    lib: {
      // Multiple entry points for main and experimental exports
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        experimental: resolve(__dirname, 'experimental/public_api.ts'),
      },
      // Package output path, must contain fesm2022
      fileName: (format, entryName) => {
        if (entryName === 'experimental') {
          return `fesm2022/tanstack-angular-router-experimental.mjs`
        }
        return `fesm2022/tanstack-angular-router.mjs`
      },
      // Publish as ESM package
      formats: ['es'],
    },
    rollupOptions: {
      // Add external libraries that should be excluded from the bundle
      external: [
        /^@angular\/.*/,
        /^@tanstack\/.*/,
        'rxjs',
        'rxjs/operators',
        'isbot',
        'tiny-invariant',
        'tiny-warning',
        'tslib',
      ],
      output: {
        // Produce a single file bundle
        preserveModules: false,
      },
    },
    minify: false,
    outDir: 'dist',
  },
}))
