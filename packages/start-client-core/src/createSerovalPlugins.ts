import {
  makeSerovalPlugin,
  defaultSerovalPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core'
import type { AnySerializationAdapter } from '@tanstack/router-core'
import type { Plugin } from 'seroval'

export function createSerovalPlugins(
  adapters: ReadonlyArray<AnySerializationAdapter> | undefined,
): Array<Plugin<any, any>> {
  return [
    ...(adapters?.map(makeSerovalPlugin) ?? []),
    ...routerDefaultSerovalPlugins,
  ]
}
