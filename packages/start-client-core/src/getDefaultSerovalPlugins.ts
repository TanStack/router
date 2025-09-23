import {
  makeSerovalPlugin,
  defaultSerovalPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core'
import { getStartInstance } from './getStartInstance'
import type { AnySerializationAdapter } from '@tanstack/router-core'

export function getDefaultSerovalPlugins() {
  const start = getStartInstance()
  const adapters = start.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  return [
    ...(adapters?.map(makeSerovalPlugin) ?? []),
    ...routerDefaultSerovalPlugins,
  ]
}
