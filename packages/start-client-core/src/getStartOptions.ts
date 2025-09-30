import { getStartContext } from '@tanstack/start-storage-context'
import { createIsomorphicFn } from './createIsomorphicFn'
import type { AnyStartInstanceOptions } from './createStart'

export const getStartOptions: () => AnyStartInstanceOptions | undefined =
  createIsomorphicFn()
    .client(() => window.__TSS_START_OPTIONS__)
    .server(() => getStartContext().startOptions)
