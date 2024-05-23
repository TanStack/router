import fs from 'fs'
import path from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackBuildConfig } from '@tanstack/config/build'
import replace from '@rollup/plugin-replace'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [
    react(),
    // @ts-ignore
    // replace({
    //   'import.meta.env': '__import__meta__env__',
    // }),
    // (() => {
    //   return {
    //     name: 'replace-import-meta-env',
    //     writeBundle(options, bundle) {
    //       const basePath = options.dir || path.dirname(options.file || '')

    //       for (const [fileName, fileEntry] of Object.entries(bundle)) {
    //         if (fileEntry.type === 'chunk') {
    //           const fullPath = path.resolve(basePath, fileName)
    //           fs.writeFileSync(
    //             fullPath,
    //             fs
    //               .readFileSync(fullPath, 'utf-8')
    //               .replace(/__import__meta__env__/g, 'import.meta.env'),
    //           )
    //         }
    //       }
    //     },
    //   }
    // })(),
  ],
})

export default mergeConfig(
  // @ts-ignore
  config,
  tanstackBuildConfig({
    entry: [
      './src/client/index.tsx',
      './src/server/index.tsx',
      './src/client-runtime/index.tsx',
    ],
    srcDir: './src',
    exclude: ['./src/config'],
  }),
)
