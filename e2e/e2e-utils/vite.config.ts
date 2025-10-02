import path from 'node:path'
import { defineConfig } from 'vitest/config'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    ssr: true,
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/index.ts',
      output: [
        {
          format: 'esm',
          dir: './dist/esm',
          entryFileNames: '[name].js',
          preserveModules: true,
          preserveModulesRoot: path.resolve(__dirname, 'src'),
        },
        {
          format: 'cjs',
          dir: './dist/cjs',
          entryFileNames: '[name].cjs',
          preserveModules: true,
          preserveModulesRoot: path.resolve(__dirname, 'src'),
        },
      ],
    },
  },
  plugins: [
    dts({
      copyDtsFiles: true,
      entryRoot: './src',
      outDir: './dist/types',
    }),
  ],
})
