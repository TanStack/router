import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'
import type { UserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [solid()] as UserConfig['plugins'],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['./tests/setupTests.tsx'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
    beforeWriteDeclarationFile: (filePath, content) => {
      if (filePath.includes('index.d.ts')) {
        return content.replace(
          `createFileRouteImpl as createFileRoute`,
          `createFileRouteGlobal as createFileRoute`,
        )
      }
      return content
    },
  }),
)
