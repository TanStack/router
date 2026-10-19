// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../code-splitter-plugin-pipeline.test.ts (fast tier).
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { expect, it } from 'vitest'
import { build, routeApp } from '../build-harness'

// A route file that both imports and declares `Route` is invalid TypeScript
// (TS2440). A real build either fails with an error naming `Route`, or
// builds a page that renders; it never builds a page that breaks. Source:
// the #8504 confidence campaign (DX-07).
it.each(['vite', 'rspack'] as const)(
  'a route file that imports and declares Route fails its build naming Route, or renders (%s)',
  async (bundler) => {
    let outcome: string
    try {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(
          `import { createFileRoute } from '@tanstack/react-router'
import { Route } from '../other'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })
`,
          { env: 'client', files: { 'other.ts': 'export const Route = 1\n' } },
        ),
      })
      outcome = String(
        (await app.run(`await entry.mount(entry.Route.options.component)`))
          .html,
      )
    } catch (error) {
      if (error instanceof BuildError && /\bRoute\b/.test(error.message)) {
        outcome = 'refused naming Route'
      } else {
        throw error
      }
    }
    expect([
      'refused naming Route',
      '<div id="root"><p>page</p></div>',
    ]).toContain(outcome)
  },
  60_000,
)

// The Solid router cannot run in process (code-splitter-plugin-pipeline's
// Solid route is checked at compile level there): a real Vite build of a
// Solid route with its loader and component in groups of their own, run in
// Chromium. Both options load lazily, the loader gives its data and the
// component renders. (The other bundlers' Solid builds:
// build-frameworks.test.ts; the groupings are decided by the transform.)
it('splits the loader and the component of a Solid route into their own groups (vite)', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    framework: 'solid',
    files: routeApp(
      `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: () => 'MARK_LOADER',
  component: () => <ul>{'MARK_COMPONENT'}</ul>,
})
`,
      { env: 'client', framework: 'solid' },
    ),
  })
  // The scripts the page loaded once the loader ran, before the component.
  const run = await app.run(`const data = await entry.Route.options.loader()
const loaded = performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname)
await entry.mount(entry.Route.options.component)
return { data, loaded }`)
  const { data, loaded } = run.result as { data: string; loaded: Array<string> }
  const componentChunks = app.chunks
    .filter((chunk) => chunk.code.includes('MARK_COMPONENT'))
    .map((chunk) => chunk.fileName)
  expect({
    loader: app.where('MARK_LOADER'),
    component: app.where('MARK_COMPONENT'),
    data,
    componentLoadedWithLoader: componentChunks.filter((chunk) =>
      loaded.some((url) => url.endsWith(`/${chunk}`)),
    ),
    html: run.html,
  }).toEqual({
    loader: 'lazy',
    component: 'lazy',
    data: 'MARK_LOADER',
    componentLoadedWithLoader: [],
    html: '<div id="root"><ul>MARK_COMPONENT</ul></div>',
  })
}, 60_000)
