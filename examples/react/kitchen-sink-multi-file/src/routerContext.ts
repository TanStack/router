import { RouterContext } from '@tanstack/router'
import { loaderClient } from './loaderClient'
import { actionClient } from './actionClient'

export const routerContext = new RouterContext<{
  loaderClient: typeof loaderClient
  actionClient: typeof actionClient
}>()
