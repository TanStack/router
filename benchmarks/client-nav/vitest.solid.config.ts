import { defineConfig } from 'vitest/config'
import { selectBenchmarkProjects } from '../vitest-projects.ts'

export default defineConfig({
  test: {
    watch: false,
    projects: selectBenchmarkProjects([
      './solid/vite.config.ts',
      './scenarios/*/solid/vite.config.ts',
    ]),
  },
})
