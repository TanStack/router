import {
  makeSerovalPlugin,
  defaultSerovalPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core'
import type { AnySerializationAdapter } from '@tanstack/router-core'
import type { AnyStartInstanceOptions } from './createStart'
import type { Plugin } from 'seroval'

export function getDefaultSerovalPlugins(
  start: AnyStartInstanceOptions | undefined,
): Array<Plugin<any, any>> {
  const adapters = start?.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  return [
    ...(adapters?.map(makeSerovalPlugin) ?? []),
    ...routerDefaultSerovalPlugins,
  ]
}
