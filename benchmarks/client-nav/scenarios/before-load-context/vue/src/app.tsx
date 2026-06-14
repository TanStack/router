import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import {
  createRootBenchmarkContext,
  updateRootBenchmarkContext,
} from '../../shared'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const rootContext = createRootBenchmarkContext()
  const router = getRouter(rootContext)
  const vueApp = Vue.createApp({
    setup() {
      return () => <RouterProvider router={router} />
    },
  })
  let didUnmount = false

  vueApp.mount(container)

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
      vueApp.unmount()
    },
  }
}
