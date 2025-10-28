import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
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
      '/not-found/via-loader-with-context',
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
    // @ts-ignore we want to keep one test with verboseFileRoutes off even though the option is hidden
    tanstackStart({
      spa: isSpaMode ? spaModeConfiguration : undefined,
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
    viteReact(),
  ],
})
