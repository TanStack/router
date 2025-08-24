import invariant from 'tiny-invariant'
import {
  makeSerovalPlugin,
  defaultSerovalPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core'
import { FormDataPlugin } from 'seroval-plugins/web'
import { getRouterInstance } from '../getRouterInstance'
import type { AnySerializationAdapter } from '@tanstack/router-core'

import type { Plugin } from 'seroval'

export const defaultSerovalPlugins = [
  ...routerDefaultSerovalPlugins,
  FormDataPlugin as Plugin<FormData, any>,
]

export function getDefaultSerovalPlugins() {
  const router = getRouterInstance()
  invariant(router, 'Expected router instance to be available')
  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  return [...(adapters?.map(makeSerovalPlugin) ?? []), ...defaultSerovalPlugins]
}
