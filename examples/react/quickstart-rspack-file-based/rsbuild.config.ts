import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import {
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
} from '@tanstack/router-plugin/rspack'

export default defineConfig({
  plugins: [pluginReact()],
  server: {
    port: 3001,
  },
  dev: {
    startUrl: false,
  },
  html: {
    tags: [
      {
        tag: 'script',
        attrs: {
          src: 'https://cdn.tailwindcss.com',
        },
      },
    ],
  },
  tools: {
    rspack: {
      plugins: [
        TanStackRouterGeneratorRspack(),
        // TanStackRouterCodeSplitterRspack(),
      ],
    },
  },
})
