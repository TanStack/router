import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack'

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    tags: [
      {
        tag: 'script',
        attrs: { src: 'https://cdn.tailwindcss.com' },
      },
    ],
  },
  tools: {
    rspack: {
      plugins: [TanStackRouterRspack()],
    },
  },
})
