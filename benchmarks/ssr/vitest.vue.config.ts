import { defineConfig } from 'vitest/config'
import { selectBenchmarkProjects } from '../vitest-projects.ts'

export default defineConfig({
  test: {
    watch: false,
    projects: selectBenchmarkProjects([
      './vue/vite.config.ts',
      './scenarios/*/vue/vite.config.ts',
    ]),
  },
})
