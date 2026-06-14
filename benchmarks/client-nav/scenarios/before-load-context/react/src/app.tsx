import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  createRootBenchmarkContext,
  updateRootBenchmarkContext,
} from '../../shared'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const rootContext = createRootBenchmarkContext()
  const router = getRouter(rootContext)
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    setRootSeed(seed: number) {
      return updateRootBenchmarkContext(rootContext, seed)
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
      reactRoot.unmount()
    },
  }
}
