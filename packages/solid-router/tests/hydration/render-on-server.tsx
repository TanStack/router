import { runInNewContext } from 'node:vm'
import { renderToString } from 'solid-js/web'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { RouterProvider, lazyRouteComponent } from '../../src'
import { Page, makeRouter } from './routes'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    serverHtml: string
    serverMatches: Array<unknown>
  }
}

// Renders the page with Solid's server build so the jsdom tests can hydrate
// the exact markup a Start server sends.
export default async function setup(project: TestProject) {
  const router = makeRouter(
    (route) => route,
    lazyRouteComponent(() => Promise.resolve({ default: Page })),
    true,
  )
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
  await router.load()
  await router.serverSsr!.dehydrate()
  const context: Record<string, any> = {
    document: { currentScript: { remove() {} } },
  }
  context.self = context
  for (const script of router.serverSsr!.takeInitialHydrationScriptTags()!
    .before) {
    runInNewContext(script.children!, context)
  }
  project.provide(
    'serverHtml',
    renderToString(() => <RouterProvider router={router} />),
  )
  project.provide('serverMatches', context.$_TSR.router.matches)
  router.serverSsr!.cleanup()
}
