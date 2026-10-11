import { defineConfig } from 'vitest/config'
import { selectBenchmarkProjects } from '../../vitest-projects.ts'

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: false,
    projects: selectBenchmarkProjects(['./scenarios/*/vue/vite.config.ts']),
  },
})
