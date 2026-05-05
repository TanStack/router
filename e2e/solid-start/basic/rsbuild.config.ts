import { defineConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/rsbuild'
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
      '/search-params/default',
      '/transition',
      '/users',
    ].some((p) => page.path.includes(p)),
  maxRedirects: 100,
}

const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginSolid(),
    tanstackStart({
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
  ],
  output: {
    distPath: {
      root: outDir,
    },
  },
})
