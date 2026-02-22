import {
  RouterCore,
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '../src'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  RouterConstructorOptions,
  RouterReadableStore,
  RouterStoreConfig,
  RouterStoresFactory,
  RouterWritableStore,
  TrailingSlashOption,
} from '../src'

const testStoreConfig: RouterStoreConfig = {
  createMutableStore<TValue>(
    initialValue: TValue,
  ): RouterWritableStore<TValue> {
    let current = initialValue

    return {
      get state() {
        return current
      },
      setState(updater) {
        const next = updater(current)
        if (Object.is(current, next)) {
          return
        }

        current = next
      },
    }
  },
  createReadonlyStore<TValue>(read: () => TValue): RouterReadableStore<TValue> {
    return {
      get state() {
        return read()
      },
    }
  },
  batch<TValue>(fn: () => TValue): TValue {
    return fn()
  },
}

export const testRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (opts.isServer) {
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
