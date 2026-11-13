import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const pkgs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tanstack\/router-generator$/, replacement: `${pkgs}/start-plugin-core/tests/research/generator-stub.ts` },
      { find: /^@tanstack\/router-utils$/, replacement: `${pkgs}/router-utils/src/index.ts` },
      { find: /^@tanstack\/router-core$/, replacement: `${pkgs}/router-core/src/index.ts` },
      { find: /^@tanstack\/virtual-file-routes$/, replacement: `${pkgs}/virtual-file-routes/src/index.ts` },
    ],
  },
  test: {
    dir: path.dirname(fileURLToPath(import.meta.url)),
    include: ['**/*.test.ts'],
    watch: false,
    testTimeout: 7_200_000,
    pool: 'forks',
    server: { deps: { external: [/\/dist\//] } },
  },
})
