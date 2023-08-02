import { RouterContext } from '@tanstack/router'
import { createLoaderClient } from './loaderClient'

export const routerContext = new RouterContext<{
  loaderClient: ReturnType<typeof createLoaderClient>
  head: string
}>()
