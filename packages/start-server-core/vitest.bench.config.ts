import { defineConfig, mergeConfig } from 'vitest/config'
import { cpuSimulationExecArgv } from '../../benchmarks/cpu-simulation'
import config from './vite.config'

export default mergeConfig(
  config,
  defineConfig({
    test: {
      environment: 'node',
      execArgv: cpuSimulationExecArgv(),
      fileParallelism: false,
      benchmark: {
        include: ['tests/response-reconciliation.bench.ts'],
      },
    },
  }),
)
