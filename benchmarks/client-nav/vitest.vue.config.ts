import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: false,
    projects: [
      './vue/vite.config.ts',
      './scenarios/route-matching/vue/vite.config.ts',
      './scenarios/location-building-links/vue/vite.config.ts',
      './scenarios/search-params/vue/vite.config.ts',
      './scenarios/before-load-context/vue/vite.config.ts',
      './scenarios/loader-cache/vue/vite.config.ts',
      './scenarios/preloading/vue/vite.config.ts',
      './scenarios/subscribers-selectors/vue/vite.config.ts',
      './scenarios/outlets-remounts/vue/vite.config.ts',
      './scenarios/control-flow/vue/vite.config.ts',
      './scenarios/interrupted-navigations/vue/vite.config.ts',
      './scenarios/scroll-restoration/vue/vite.config.ts',
      './scenarios/masking-rewrites/vue/vite.config.ts',
      './scenarios/head-management/vue/vite.config.ts',
      './scenarios/deferred-await/vue/vite.config.ts',
      './scenarios/history-events-blockers/vue/vite.config.ts',
      './scenarios/hydration-resume/vue/vite.config.ts',
    ],
  },
})
