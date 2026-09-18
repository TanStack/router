import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { isServer } from '@tanstack/router-core/isServer'
import { createDiagnostics } from '../fixture'
import { createFixtureRouter } from './app'

export const serverEnvironment = isServer
let router: ReturnType<typeof createFixtureRouter> | undefined
let app: ReturnType<typeof Vue.createSSRApp> | undefined
let diagnostics = createDiagnostics()
let flushed = false
const errors: Array<string> = []

export async function start(countRenders = false) {
  if (router) {
    throw new Error('A hydration sample must use a fresh client realm')
  }
  if (!window.$_TSR?.router) {
    throw new Error('Missing SSR hydration payload')
  }
  const container = document.getElementById('__app')
  if (!container) {
    throw new Error('Missing SSR app container')
  }
  diagnostics = createDiagnostics(countRenders)
  router = createFixtureRouter(false, diagnostics)
  // Vue's RouterClient uses this core API. Restore before DOM hydration, rather
  // than mounting RouterClient's initially empty tree and rendering it later.
  await hydrate(router)
  window.$_TSR.h()
  app = Vue.createSSRApp({
    setup: () => () => <RouterProvider router={router!} />,
  })
  app.config.errorHandler = (error) => errors.push(String(error))
  app.config.warnHandler = (message) => errors.push(message)
  app.mount(container)
  await flush()
}

export async function flush() {
  // Include mount hooks, post-flush watchers and any updates they enqueue.
  await Vue.nextTick()
  await Vue.nextTick()
  flushed = diagnostics.mounted
}

export function ready() {
  // Completion is independent of the expected DOM. A real hash mismatch must
  // reach validation as a failure, rather than waiting for a React-style render.
  return diagnostics.mounted && flushed
}

export function snapshot() {
  const matches = router?.stores.matches.get()
  return {
    diagnostics: { ...diagnostics },
    errors: [...errors],
    location: router?.stores.location.get().href,
    matches: matches?.map((match) => ({
      status: match.status,
      context: match.context,
      loaderData: match.loaderData,
    })),
  }
}

export async function dispose() {
  app?.unmount()
  await Vue.nextTick()
  router?.history.destroy()
}
