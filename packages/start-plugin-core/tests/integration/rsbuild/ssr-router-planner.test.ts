/**
 * An Rsbuild build without RSC: the `ssr` compile environment provides the
 * server functions and renders no server components, so the router planner
 * runs there as in the client: the SSR build loads the route's loader with
 * the app and its component when it renders (`start-build-route-app.ts`:
 * load markers, not chunk names), and renders the page.
 * Source: RSC model v2 §2.5 (the role test of §1.1: with RSC off the provider
 * keeps the router planner; only the environment rendering server
 * components drops it).
 */
import { expect, test } from 'vitest'
import { loadedModulesExpression } from '@tanstack/compiler-test-utils/importers'
import { buildStart } from '../../build-start'
import { routeFiles } from '../start-build-route-app'

const timeout = 60_000

test(
  'the SSR build splits the route as the client build does, and renders it',
  async () => {
    const { client, ssr } = await buildStart({
      bundler: 'rsbuild',
      files: routeFiles,
      entry: 'src/entry.ts',
    })
    const script = `const loaded = () => [...${loadedModulesExpression}]
const atStart = loaded()
const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
await route.options.component.preload?.()
return {
  loader: atStart.includes('loader') ? 'eager' : 'lazy',
  component: atStart.includes('component') ? 'eager' : 'lazy',
  preloaded: loaded().includes('component'),
  page: await entry.renderPath(entry.getRouter().routeTree, '/'),
}`
    const expected = {
      loader: 'eager',
      component: 'lazy',
      preloaded: true,
      page: expect.stringContaining('MARK_COMPONENT'),
    }
    expect({
      client: (await client.run(script)).result,
      ssr: (await ssr.run(script)).result,
    }).toEqual({ client: expected, ssr: expected })
  },
  timeout,
)
