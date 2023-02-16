import { createRequestHandler } from '@tanstack/start/server'
import { createLoaderClient } from './.start/loaders'
import { routeTree } from './.start/routes'

export const all = createRequestHandler({
  routeTree,
  createLoaderClient,
})
