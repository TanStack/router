import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import { copyFilesPlugin } from '@tanstack/router-utils'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [
    copyFilesPlugin({
      pattern: ['*.ts', '!*.d.ts'],
      fromDir: 'src/default-entry',
      toDir: 'dist/plugin/default-entry',
    }),
  ],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'node',
    typecheck: { enabled: true },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    srcDir: './src',
    exclude: ['./src/default-entry'],
    entry: [
      './src/index.ts',
      './src/client.ts',
      './src/client-rpc.ts',
      './src/ssr-rpc.ts',
      './src/server-rpc.ts',
      './src/server.ts',
      './src/plugin/vite.ts',
      './src/server-only.ts',
      './src/client-only.ts',
    ],
    externalDeps: [
      '@tanstack/octane-start-client',
      '@tanstack/octane-start-server',
    ],
    cjs: false,
  }),
)
