import { createIsomorphicFn } from '@tanstack/react-start'

export const getIsomorphicEnv = createIsomorphicFn()
  .client(() => 'client')
  .server(() => 'server')
