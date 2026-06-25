import { render } from 'solid-js/web'
import { RouterProvider } from '@tanstack/solid-router'
import {
  createRootBenchmarkContext,
  updateRootBenchmarkContext,
} from '../../shared'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const rootContext = createRootBenchmarkContext()
  const router = getRouter(rootContext)
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    setRootSeed(seed: number) {
      const version = updateRootBenchmarkContext(rootContext, seed)
      router.update({
        ...router.options,
        context: rootContext,
      })

      return version
    },
    getRootVersion() {
      return rootContext.version
    },
    getBeforeLoadCounters() {
      return rootContext.counters
    },
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
