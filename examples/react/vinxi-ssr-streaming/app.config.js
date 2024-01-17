import reactRefresh from '@vitejs/plugin-react'
import { serverFunctions } from '@vinxi/server-functions/plugin'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { createApp } from 'vinxi'

export default createApp({
  routers: [
    {
      name: 'public',
      mode: 'static',
      dir: './public',
      base: '/',
    },
    {
      name: 'ssr',
      mode: 'handler',
      middleware: './app/middleware.tsx',
      handler: './app/server.tsx',
      target: 'server',
      plugins: () => [reactRefresh(), TanStackRouterVite()],
    },
    {
      name: 'client',
      mode: 'build',
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
