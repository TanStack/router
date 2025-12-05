import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import { isSpaMode } from './tests/utils/isSpaMode'
import { isPrerender } from './tests/utils/isPrerender'

const spaModeConfiguration = {
  enabled: true,
  prerender: {
    outputPath: 'index.html',
  },
}

const prerenderConfiguration = {
  enabled: true,
  filter: (page: { path: string }) =>
    ![
      '/this-route-does-not-exist',
      '/redirect',
      '/i-do-not-exist',
      '/not-found/via-beforeLoad',
      '/not-found/via-head',
      '/not-found/via-loader',
      '/search-params/default',
      '/transition',
      '/users',
    ].some((p) => page.path.includes(p)),
  maxRedirects: 100,
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      spa: isSpaMode ? spaModeConfiguration : undefined,
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
    viteSolid({ ssr: true }),
  ],
})
