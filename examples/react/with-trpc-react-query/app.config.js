import { defineConfig } from 'vite'
import reactRefresh from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// TODO: Need to migrate this to vite and the new TanStack Start plugin

export default defineConfig({
  server: {
    preset: 'node-server', // change to 'netlify' or 'bun' or anyof the supported presets for nitro (nitro.unjs.io)
    experimental: {
      asyncContext: true,
    },
  },
  routers: [
    {
      type: 'static',
      name: 'public',
      dir: './public',
    },
    {
      type: 'http',
      name: 'trpc',
      base: '/trpc',
      handler: './trpc-server.handler.ts',
      target: 'server',
      plugins: () => [],
    },
    {
      type: 'spa',
      name: 'client',
      handler: './index.html',
      target: 'browser',
      plugins: () => [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
        }),
        reactRefresh(),
      ],
    },
  ],
})
