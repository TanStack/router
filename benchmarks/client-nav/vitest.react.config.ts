import { defineConfig } from 'vitest/config'
import { selectBenchmarkProjects } from '../vitest-projects.ts'

export default defineConfig({
  test: {
    watch: false,
    projects: selectBenchmarkProjects([
      './react/vite.config.ts',
      './scenarios/*/react/vite.config.ts',
    ]),
  },
})
