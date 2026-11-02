import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import { isSpaMode } from './tests/utils/isSpaMode'
import { isPrerender } from './tests/utils/isPrerender'
import tailwindcss from '@tailwindcss/vite'

const spaModeConfiguration = {
  enabled: true,
  prerender: {
    outputPath: 'index.html',
  },
}

const prerenderConfiguration = {
  enabled: true,
  filter: (page: { path: string }) =>
    !(process.platform === 'win32' && page.path.includes('|')) &&
    ![
      '/this-route-does-not-exist',
      '/error-normalization',
      '/redirect',
      '/i-do-not-exist',
      '/posts/i-do-not-exist',
      '/not-found',
      '/specialChars/search',
      '/specialChars/hash',
      '/specialChars/malformed',
      '/search-params/default',
      '/transition',
      '/users',
    ].some((p) => page.path === p || page.path.startsWith(`${p}/`)),
  maxRedirects: 100,
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
      sitemap: isPrerender
        ? {
            enabled: true,
            host: 'https://example.com',
          }
        : undefined,
    }),
    viteSolid({ ssr: true }),
  ],
})
