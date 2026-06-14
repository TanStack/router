import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: false,
    projects: [
      './solid/vite.config.ts',
      './scenarios/route-matching/solid/vite.config.ts',
      './scenarios/location-building-links/solid/vite.config.ts',
      './scenarios/search-params/solid/vite.config.ts',
      './scenarios/before-load-context/solid/vite.config.ts',
      './scenarios/loader-cache/solid/vite.config.ts',
      './scenarios/preloading/solid/vite.config.ts',
      './scenarios/subscribers-selectors/solid/vite.config.ts',
      './scenarios/outlets-remounts/solid/vite.config.ts',
      './scenarios/control-flow/solid/vite.config.ts',
      './scenarios/interrupted-navigations/solid/vite.config.ts',
      './scenarios/scroll-restoration/solid/vite.config.ts',
      './scenarios/masking-rewrites/solid/vite.config.ts',
      './scenarios/head-management/solid/vite.config.ts',
      './scenarios/deferred-await/solid/vite.config.ts',
      './scenarios/history-events-blockers/solid/vite.config.ts',
      './scenarios/hydration-resume/solid/vite.config.ts',
    ],
  },
})
