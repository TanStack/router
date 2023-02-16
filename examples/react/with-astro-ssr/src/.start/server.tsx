import { createRequestHandler } from '@tanstack/react-start/server'
import { createLoaderClient } from './loaders'
import { routeTree } from './routes'

export function createAstroHandler() {
  return createRequestHandler({
    routeTree,
    createLoaderClient,
  })
}
