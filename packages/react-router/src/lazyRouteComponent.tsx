import * as React from 'react'
import { AsyncRouteComponent } from './route'

export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let loadPromise: Promise<any>

  const load = () => {
    if (!loadPromise) {
      loadPromise = importer()
    }

    return loadPromise
  }

  const lazyComp = React.lazy(async () => {
    const moduleExports = await load()
    const comp = moduleExports[exportName ?? 'default']
    return {
      default: comp,
    }
  })
  ;(lazyComp as any).preload = load

  return lazyComp as any
}
