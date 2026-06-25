import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: false,
    projects: [
      './react/vite.config.ts',
      './scenarios/route-matching/react/vite.config.ts',
      './scenarios/location-building-links/react/vite.config.ts',
      './scenarios/search-params/react/vite.config.ts',
      './scenarios/before-load-context/react/vite.config.ts',
      './scenarios/loader-cache/react/vite.config.ts',
      './scenarios/preloading/react/vite.config.ts',
      './scenarios/subscribers-selectors/react/vite.config.ts',
      './scenarios/outlets-remounts/react/vite.config.ts',
      './scenarios/control-flow/react/vite.config.ts',
      './scenarios/interrupted-navigations/react/vite.config.ts',
      './scenarios/scroll-restoration/react/vite.config.ts',
      './scenarios/masking-rewrites/react/vite.config.ts',
      './scenarios/head-management/react/vite.config.ts',
      './scenarios/deferred-await/react/vite.config.ts',
      './scenarios/history-events-blockers/react/vite.config.ts',
      './scenarios/hydration-resume/react/vite.config.ts',
    ],
  },
})
