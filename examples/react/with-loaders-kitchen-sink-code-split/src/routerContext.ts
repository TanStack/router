import { RouterContext } from '@tanstack/react-router'
import { loaderClient } from './loaderClient'
import { actionClient } from './actionClient'

export const routerContext = new RouterContext<{
  loaderClient: typeof loaderClient
  actionClient: typeof actionClient
}>()
