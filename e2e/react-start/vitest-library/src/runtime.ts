import {
  createClientOnlyFn,
  createIsomorphicFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
import { readSecret } from './server-only'

export const describeRuntime = createIsomorphicFn()
  .server(() => `server with ${readSecret()}`)
  .client(() => 'client')

export const getSecret = createServerOnlyFn(() => readSecret())

export const getLanguage = createClientOnlyFn(() => navigator.language)
