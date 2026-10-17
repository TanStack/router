import { defineConfig, mergeConfig } from 'vitest/config'
import config from './vite.config'

export default mergeConfig(
  config,
  defineConfig({
    test: {
      dir: '.',
      environment: 'node',
      fileParallelism: false,
      maxWorkers: 1,
      typecheck: { enabled: false },
      benchmark: {
        include: ['tests/mask-inherit-search.bench.ts'],
      },
    },
  }),
)
