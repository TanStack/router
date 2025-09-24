import { getStartContext } from '@tanstack/start-storage-context'
import { createIsomorphicFn } from './createIsomorphicFn'

export const getStartOptions = createIsomorphicFn()
  .client(() => window.__TSS_START_OPTIONS__!)
  .server(() => getStartContext().startOptions)
