import { defineConfig } from 'vitest/config'
import { selectBenchmarkProjects } from '../../vitest-projects.ts'

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: false,
    projects: selectBenchmarkProjects(['./scenarios/*/solid/vite.config.ts']),
  },
})
