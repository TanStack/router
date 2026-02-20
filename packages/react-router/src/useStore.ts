import { batch, useStore as useReactStore } from '@tanstack/react-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { AnyRouter } from '@tanstack/router-core'
import type { AnyAtom } from '@tanstack/react-store'

type CompareFn<T> = (a: T, b: T) => boolean

type UseStoreOptions<T> = {
  compare?: CompareFn<T>
  router?: Pick<AnyRouter, 'isServer'>
}

export { batch }

export function useStore<TAtom extends AnyAtom | undefined, T>(
  atom: TAtom,
  selector: (
    snapshot: TAtom extends { get: () => infer TSnapshot }
      ? TSnapshot
      : undefined,
  ) => T,
  compareOrOptions?: CompareFn<T> | UseStoreOptions<T>,
  options?: Pick<UseStoreOptions<T>, 'router'>,
): T {
  const contextRouter = useRouter({ warn: false })

  const compare =
    typeof compareOrOptions === 'function'
      ? compareOrOptions
      : compareOrOptions?.compare

  const router =
    (typeof compareOrOptions === 'function'
      ? options?.router
      : compareOrOptions?.router) ?? contextRouter

  const _isServer = isServer ?? router?.isServer ?? false

  if (_isServer) {
    const snapshot = atom ? atom.get() : undefined
    return selector(snapshot as any)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useReactStore(atom as any, selector as any, compare as any)
}
