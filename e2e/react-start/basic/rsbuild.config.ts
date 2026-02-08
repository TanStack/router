import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { isSpaMode } from './tests/utils/isSpaMode'
import { isPrerender } from './tests/utils/isPrerender'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

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
      '/not-found/via-loader',
      '/specialChars/search',
      '/specialChars/hash',
      '/specialChars/malformed',
      '/users',
    ].some((p) => page.path.includes(p)),
  maxRedirects: 100,
}

export default defineConfig({
  plugins: [
    pluginReact(),
    ...tanstackStart({
      spa: isSpaMode ? spaModeConfiguration : undefined,
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
  ],
  tools: {
    rspack: {
      module: {
        rules: [
          {
            resourceQuery: /url/,
            type: 'asset/resource',
          },
        ],
      },
    },
  },
  source: {
    alias: {
      '~': path.resolve(currentDir, 'src'),
    },
  },
})
