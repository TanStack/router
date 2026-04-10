import { getStartContext } from '@tanstack/start-storage-context'
import { createServerOnlyFn } from '@tanstack/start-fn-stubs'

export const getStartContextServerOnly: typeof getStartContext =
  createServerOnlyFn(getStartContext)
