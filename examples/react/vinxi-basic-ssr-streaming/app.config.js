import reactRefresh from '@vitejs/plugin-react'
import { serverFunctions } from '@vinxi/server-functions/plugin'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { createApp } from 'vinxi'

export default createApp({
  routers: [
    {
      name: 'public',
      type: 'static',
      dir: './public',
      base: '/',
    },
    {
      name: 'ssr',
      type: 'http',
      middleware: './app/middleware.tsx',
      handler: './app/server.tsx',
      target: 'server',
      plugins: () => [reactRefresh(), TanStackRouterVite()],
    },
    {
      name: 'client',
      type: 'client',
      handler: './app/client.tsx',
      target: 'browser',
      plugins: () => [
        serverFunctions.client(),
        reactRefresh(),
        TanStackRouterVite(),
      ],
      base: '/_build',
    },
    serverFunctions.router(),
  ],
})
