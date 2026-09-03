import {
  createDefaultSerovalPlugins as createRouterDefaultSerovalPlugins,
  makeSerovalPlugin,
  defaultSerovalPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core/ssr/client'
import { getStartOptions } from './getStartOptions'
import type { AnySerializationAdapter } from '@tanstack/router-core/ssr/client'
import type { Plugin } from 'seroval'

export function getSerovalPlugins(
  routerPlugins: Array<Plugin<any, any>>,
): Array<Plugin<any, any>> {
  const start = getStartOptions()
  const adapters = start?.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  return [...(adapters?.map(makeSerovalPlugin) ?? []), ...routerPlugins]
}

export function getDefaultSerovalPlugins(
  signal?: AbortSignal,
): Array<Plugin<any, any>> {
  return getSerovalPlugins(
    signal
      ? createRouterDefaultSerovalPlugins(signal)
      : routerDefaultSerovalPlugins,
  )
}
