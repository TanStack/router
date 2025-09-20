import { getStartContext } from '@tanstack/start-storage-context'
import { createIsomorphicFn } from './createIsomorphicFn'

export const getStartInstance = createIsomorphicFn()
  .client(() => window.__TSS_START_INSTANCE__!)
  .server(() => getStartContext().start)
