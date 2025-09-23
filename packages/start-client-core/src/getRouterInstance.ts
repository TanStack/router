import { getStartContext } from '@tanstack/start-storage-context'
import { createIsomorphicFn } from './createIsomorphicFn'

// TODO should this be a public API
export const getRouterInstance = createIsomorphicFn()
  .client(() => window.__TSR_ROUTER__!)
  .server(() => getStartContext().getRouter())
