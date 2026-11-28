/**
 * Rsbuild: a transform the app registers on the route tree module runs as
 * for any other module: once in a client build that builds the module
 * (without a persistent cache, and in the build that fills one), not at all
 * in a build that restores the unchanged module from the cache, and once,
 * on the new tree, in a build on the cache after a route was added.
 * Source: astra round 3 fact-check of #8817 (B1: a fresh build ran the
 * client route tree's loader chain twice on the identical input); hotspot 3
 * (a restored tree module built from the current tree is not built again).
 */
import { expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildEntries } from '../route-css-cases'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'

const timeout = 60_000

const files = {
  ...rsbuildEntries,
  'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>index</p> })
`,
  'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: () => <p>about</p> })
`,
}

/**
 * An app plugin that records the client route tree each transform call
 * receives, one list per build (each build sets the plugin up again).
 */
function observeRouteTree() {
  const builds: Array<Array<string>> = []
  const plugin: RsbuildPlugin = {
    name: 'test-observe-route-tree',
    setup(api) {
      const calls: Array<string> = []
      builds.push(calls)
      api.transform(
        { test: /[\\/]routeTree\.gen\.ts$/, environments: ['client'] },
        ({ code }) => {
          calls.push(code)
          return code
        },
      )
    },
  }
  return { builds, plugin }
}

async function transformCalls(
  builds: number,
  rsbuildConfig: RsbuildConfig = {},
): Promise<Array<Array<string>>> {
  const observed = observeRouteTree()
  await buildStart({
    bundler: 'rsbuild',
    builds,
    rsbuildConfig: { ...rsbuildConfig, plugins: [observed.plugin] },
    files,
  })
  return observed.builds
}

test(
  'a transform of the client route tree runs once per build that builds the module, and not for a restored one',
  async () => {
    const [fresh] = await transformCalls(1)
    const [cold, warm] = await transformCalls(2, {
      performance: { buildCache: true },
    })
    expect(fresh).toHaveLength(1)
    expect(cold).toHaveLength(1)
    expect(warm).toHaveLength(0)
    expect(fresh![0]).toContain(`'/about'`)
    expect(cold![0]).toBe(fresh![0])
  },
  timeout,
)

test(
  'a build on the cache after a route was added runs the transform once, on the new tree',
  async () => {
    const observed = observeRouteTree()
    const cold = await buildStart({
      bundler: 'rsbuild',
      rsbuildConfig: {
        performance: { buildCache: true },
        plugins: [observed.plugin],
      },
      files,
    })
    await cold.rebuild({
      'src/routes/contact.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/contact')({ component: () => <p>contact</p> })
`,
    })
    const [first, second] = observed.builds
    expect(first).toHaveLength(1)
    expect(first![0]).not.toContain(`'/contact'`)
    expect(second).toHaveLength(1)
    expect(second![0]).toContain(`'/contact'`)
  },
  timeout,
)
