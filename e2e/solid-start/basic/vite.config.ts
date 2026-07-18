import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import { e2eStartDummyServerForBuild } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './tests/utils/isSpaMode'
import { isPrerender } from './tests/utils/isPrerender'
import tailwindcss from '@tailwindcss/vite'

if (isPrerender) {
  await e2eStartDummyServerForBuild()
}

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
      '/not-found',
      '/specialChars/search',
      '/specialChars/hash',
      '/specialChars/malformed',
      '/search-params/default',
      '/transition',
      '/users',
    ].some((p) => page.path.includes(p)),
  maxRedirects: 100,
  retryCount: 2,
  retryDelay: 1000,
}

const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    outDir,
  },
  server: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: isSpaMode ? spaModeConfiguration : undefined,
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
    viteSolid({ compiler: 'babel', ssr: true }),
  ],
})
