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
      name: 'client',
      mode: 'spa',
      handler: 'index.html',
      target: 'browser',
      plugins: () => [
        serverFunctions.client(),
        reactRefresh(),
        TanStackRouterVite(),
      ],
    },
    serverFunctions.router(),
  ],
})
