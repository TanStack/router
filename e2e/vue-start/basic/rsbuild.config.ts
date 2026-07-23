import { defineConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginVue } from '@rsbuild/plugin-vue'
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx'
import { tanstackStart } from '@tanstack/vue-start/plugin/rsbuild'
import { isPrerender } from './tests/utils/isPrerender'

const prerenderConfiguration = {
  enabled: true,
  filter: (page: { path: string }) =>
    ![
      '/this-route-does-not-exist',
      '/redirect',
      '/i-do-not-exist',
      '/not-found',
      '/specialChars/search',
      '/specialChars/hash',
      '/specialChars/malformed',
      '/search-params', // search-param routes have dynamic content based on query params
      '/transition',
      '/users',
    ].some((p) => page.path === p || page.path.startsWith(`${p}/`)),
  maxRedirects: 100,
}

const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginVue(),
    pluginVueJsx(),
    tanstackStart({
      prerender: isPrerender ? prerenderConfiguration : undefined,
      sitemap: isPrerender
        ? {
            enabled: true,
            host: 'https://example.com',
          }
        : undefined,
    }),
  ],
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
  source: {
    define: {
      __TSR_PRERENDER__: JSON.stringify(isPrerender),
    },
  },
  output: {
    distPath: {
      root: outDir,
    },
  },
})
