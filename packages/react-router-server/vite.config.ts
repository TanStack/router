import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackBuildConfig } from '@tanstack/config/build'
import { replaceCodePlugin } from 'vite-plugin-replace'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const config = defineConfig({
  plugins: [
    react(),
    replaceCodePlugin({
      replacements: [
        {
          from: /import.meta.env/g,
          to: '__import__meta__env__',
        },
      ],
    }),
    (() => {
      return {
        name: 'replace-import-meta-env',
        writeBundle(options, bundle) {
          const basePath = options.dir || path.dirname(options.file || '')

          for (const [fileName, fileEntry] of Object.entries(bundle)) {
            if (fileEntry.type === 'chunk') {
              const fullPath = path.resolve(basePath, fileName)
              fs.writeFileSync(
                fullPath,
                fs
                  .readFileSync(fullPath, 'utf-8')
                  .replace(/__import__meta__env__/g, 'import.meta.env'),
              )
            }
          }
        },
      }
    })(),
  ],
})

export default mergeConfig(
  config,
  tanstackBuildConfig({
    entry: [
      './src/client.tsx',
      './src/server.tsx',
      './src/client-runtime.tsx',
      './src/server-runtime.tsx',
      './src/server-handler.tsx',
    ],
    srcDir: './src',
  }),
)
