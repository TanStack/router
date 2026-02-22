import { isServer } from "@tanstack/router-core/isServer"
import {
  RouterCore,
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '../src'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  RouterConstructorOptions,
  RouterStoreConfig,
  RouterStoresFactory,
  TrailingSlashOption,
} from '../src'

const testStoreConfig: RouterStoreConfig = {
  createMutableStore(initialValue) {
    let current = initialValue

    return {
      get state() {
        return current
      },
      setState(updater) {
        const next = updater(current)
        if (Object.is(current, next)) return

        current = next
      },
    }
  },
  createReadonlyStore(read) {
    return {
      get state() {
        return read()
      },
    }
  },
  batch: (fn) => fn(),
}

export const testRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (isServer ?? opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

    return {
      stores: createRouterStoresWithConfig(initialState, testStoreConfig),
      batch: testStoreConfig.batch,
    }
  },
}

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options, testRouterStoresFactory)
}
