import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { batch, createAtom } from '@tanstack/store'
import { startTransition } from 'octane'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'

const isServerEnvironment = typeof document === 'undefined'

const octaneStoreFactory = (options: { isServer?: boolean }) => {
  if (options.isServer ?? isServerEnvironment) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (callback: () => void) => callback(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch: (callback: () => void) => startTransition(() => batch(callback)),
  }
}

export const createRouter: CreateRouterFn = (options) => new Router(options)

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption = 'never',
  in out TDefaultStructuralSharingOption extends boolean = false,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    super(options, octaneStoreFactory)
  }
}
