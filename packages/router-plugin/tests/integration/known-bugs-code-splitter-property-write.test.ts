/**
 * Known code-splitter bug, per bundler and side-effect hint (SPEC J2.5, G2,
 * G8): a split component the route file writes a property of
 * (`Page.displayName = ...`) must load with its chunk and render the
 * property in every production client build. Whether a property-bearing
 * component (or a support module or factory a compiler emits for it) is
 * dropped from the entry is each bundler's tree-shaking decision, with and
 * without `"sideEffects": false`: Vite/Rolldown, Rspack and webpack treat
 * annotated factories differently (FOLLOWUPS, annotation divergence), so
 * every cell is its own outcome (V1R split S17 restored the seven cells the
 * speed pass removed). Each cell is a small app of its own (the property
 * write breaks today's entry chunk, which would take the other cases of a
 * shared app down with it); the cells build concurrently.
 */
import { describe, it } from 'vitest'
import { build, buildWithRsbuild } from '../build-harness'
import { head } from '../regression-helpers'
import type { TestContext } from 'vitest'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 120_000

const marker = 'MARK_display_name_END'

const files = {
  'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'routes/display-name.tsx': `${head}function Page() {
  return <div>{'${marker}'}{Page.displayName}</div>
}
Page.displayName = 'PageDisplay'
export const Route = createFileRoute('/display-name')({ component: Page })
`,
  // Mounts the component of the route at `path` into #root (preloading it
  // first when it is lazy), from the generated route tree.
  'entry.ts': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
export async function mount(path: string) {
  const route = (routeTree.children as Array<any>).find(
    (child) => child.options.path === path,
  )
  await route.options.component.preload?.()
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(createElement(route.options.component)))
}
`,
}

// Bug: the code splitter moves a component into its chunk but leaves a
// top-level write to it (`Page.displayName = ...`) in the route module,
// where `Page` is no longer declared (in process: "top-level writes to the
// split component (property assignment) stay with the binding they write",
// ../known-bugs-code-splitter.test.ts). The build harness rejects the
// production client output, whose entry chunk reads the undeclared `Page`.
// Keeping a copy of the component and its write in the route module as
// well is no fix: the page code then loads with the entry chunk.
// Source: the #8504 probe (memos/splitter.md B6).
// Impact: the app's entry throws when it loads ("Page is not defined").
describe.concurrent.each([
  'vite',
  'rspack',
  'webpack',
  'rsbuild',
] as const)('%s', (bundler) => {
  it.for([
    { hint: 'without a sideEffects field', sideEffects: undefined },
    { hint: 'with "sideEffects": false', sideEffects: false },
  ])(
    'a component the route file writes a property of loads with its chunk and renders the property ($hint)',
    { timeout, fails: true },
    async ({ sideEffects }, { expect, onTestFinished }: TestContext) => {
      const options = {
        sideEffects,
        files,
        registerCleanup: onTestFinished,
      }
      const built =
        bundler === 'rsbuild'
          ? await buildWithRsbuild(options)
          : await build({
              bundler: bundler satisfies Bundler,
              env: 'client',
              ...options,
            })
      const { html } = await built.run(`await entry.mount('/display-name')`)
      expect({ placement: built.where(marker), html }).toEqual({
        placement: 'lazy',
        html: `<div id="root"><div>${marker}PageDisplay</div></div>`,
      })
    },
  )
})
