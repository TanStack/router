import { getStartContext } from '@tanstack/start-storage-context'
import { createServerOnlyFn } from './envOnly'

export const getServerContextAfterGlobalMiddlewares = createServerOnlyFn(() => {
  const start = getStartContext()
  return start.contextAfterGlobalMiddlewares
})
