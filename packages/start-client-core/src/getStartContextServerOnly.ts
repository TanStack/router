import { getStartContext } from '@tanstack/start-storage-context'
import { createServerOnlyFn } from './envOnly'

export const getStartContextServerOnly = createServerOnlyFn(getStartContext)
