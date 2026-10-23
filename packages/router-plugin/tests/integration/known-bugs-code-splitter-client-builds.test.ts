// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */

import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

/**
 * Bundlers whose router plugin splits routes (the esbuild adapter does not;
 * pinned in build-harness.test.ts).
 */
const clientBundlers: Array<Bundler> = ['vite', 'rspack', 'webpack']

describe('route options written in other shapes', () => {
  // The unused `makeOptions` of the two rows above may name a `Page` its
  // module no longer declares (user ruling 2026-10-17, widened: the bundlers
  // delete it), as long as that dead code does not reach a production client
  // bundle (which the build harness also checks for any dangling name).
  test.each(
    clientBundlers.flatMap((bundler) =>
      [
        `createFileRoute('/')({ ssr: false, component: Page } as any)`,
        `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
      ].map((route) => ({ bundler, route })),
    ),
  )(
    'a route written as $route drops its unused options factory from a production client build ($bundler)',
    async ({ bundler, route }) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(
          `${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page, title: 'MARK_MAKE_OPTIONS_END' })
export const Route = ${route}
`,
          { env: 'client' },
        ),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect({
        makeOptions: app.where('MARK_MAKE_OPTIONS_END'),
        html: run.html,
      }).toEqual({
        makeOptions: 'nowhere',
        html: '<div id="root"><p>page</p></div>',
      })
    },
    60_000,
  )
})

describe('what split chunks hold', () => {
  // Bug: once the pin above is fixed, the split option must also end up
  // split, or the build must say why (decision D11). Splitting the result of
  // a call would change when the call runs, so the user has to change the
  // pattern: a warning naming the file and the option is acceptable. Today
  // the build fails first (same root cause as the pin above).
  // Impact: the component loads with the entry chunk.
  test.fails(
    'a component declared by an array destructuring of a call shared with the errorComponent is split or reported',
    async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(
          `${head}const createPair = () => [() => <div>{'MARK_PAGE'}</div>, () => <p>error</p>]
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})
`,
          { env: 'client' },
        ),
      })
      const reported =
        findDiagnostics([...app.warnings, ...app.consoleMessages], {
          severity: 'warning',
          file: 'routes/index.tsx',
          root: app.root,
        }).length > 0
      expect({
        lazy: app.where('MARK_PAGE') === 'lazy',
        reported,
      }).not.toEqual({ lazy: false, reported: false })
    },
    60_000,
  )
})

describe('exported bindings', () => {
  // Bug: same as above, in a real client build whose entry imports the
  // exported component (`export * from './routes/index'`): the component is
  // in both the entry chunk and the split chunk, and the route renders the
  // copy. One instance is the goal: the function the route renders on its
  // error path is the one the entry imports, its module-level state is
  // created once (SPEC J2.4, G9); and the option is split, or unsplit with
  // a warning naming the route file (decision D11), whichever chunk holds it.
  // Impact: the component's code ships twice and runs as two components.
  // Whether the option is lazy or reported is the router transform's
  // decision, so one bundler shows it (speedup 7: the Rspack and webpack
  // cells were decided by the same transform as this Vite cell).
  test.fails(
    'an exported errorComponent written as `PostErrorComponent as any` is one instance in the client (vite build)',
    async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(
          `${head}import { label, see } from '../see'
const errorLabel = label('MARK_POST_ERROR_END')
export const Route = createFileRoute('/')({
  errorComponent: PostErrorComponent as any,
  component: () => {
    throw new Error('post failed')
  },
})
export function PostErrorComponent() {
  see(PostErrorComponent)
  return <p>{errorLabel}</p>
}
`,
          {
            env: 'client',
            files: {
              'see.ts': `export const seen: Array<unknown> = []
export let labels = 0
export function see(component: unknown) {
  seen.push(component)
}
export function label(text: string) {
  labels++
  return text
}
`,
              // The client entry (`mount`, the route module's exports) and
              // the app rendered at `/` through the real router.
              'entry.ts': `${clientMountEntry}import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export { seen, labels } from './see'
export async function renderAt(path: string, text: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  for (let tries = 0; tries < 200 && !container.innerHTML.includes(text); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return container.innerHTML
}
`,
            },
          },
        ),
      })
      const { result } = await app.run(
        `const html = await entry.renderAt('/', 'MARK_POST_ERROR_END')
return {
  rendered: html.includes('MARK_POST_ERROR_END'),
  oneInstance:
    entry.seen.length > 0 &&
    entry.seen.every((component) => component === entry.PostErrorComponent),
  labels: entry.labels,
  lazy: typeof entry.Route.options.errorComponent.preload === 'function',
}`,
      )
      const { lazy, ...instance } = result as Record<string, unknown>
      expect(instance).toEqual({ rendered: true, oneInstance: true, labels: 1 })
      // Placement: split, or kept in the route with a report.
      const reported =
        findDiagnostics([...app.warnings, ...app.consoleMessages], {
          severity: 'warning',
          file: 'routes/index.tsx',
          root: app.root,
        }).length > 0
      expect({ splitOrReported: lazy === true || reported }).toEqual({
        splitOrReported: true,
      })
    },
    60_000,
  )
})

describe('code that reads a split binding', () => {
  /**
   * Builds a route whose split component `Page` an unused module-level
   * object also names, and mounts the component in the client bundle.
   */
  async function mountUnusedReader(bundler: Bundler) {
    const app = await build({
      bundler,
      env: 'client',
      files: routeApp(
        `${head}function Page() {
  return <p>MARK_PAGE</p>
}
const opts = { component: Page }
export const Route = createFileRoute('/')({ component: Page })
`,
        { env: 'client' },
      ),
    })
    const run = await app.run(
      `await entry.mount(entry.Route.options.component)`,
    )
    return run.html
  }

  // Control for the pin below: Rspack and webpack drop the unused object
  // while minifying, together with its read of the deleted binding.
  test.each(['rspack', 'webpack'] as const)(
    'a split component that an unused object names renders (%s)',
    async (bundler) => {
      expect(await mountUnusedReader(bundler)).toContain('<p>MARK_PAGE</p>')
    },
    60_000,
  )

  // Bug: same root cause as above, for an unused module-level object that
  // names the split component: the route module keeps the object but loses
  // `Page`. Rolldown keeps the object, as reading an undeclared binding can
  // throw. (The build harness now rejects that output before it runs: its
  // entry chunk reads the undeclared `Page`.)
  // Source: Wave B (a Vite Start client bundle crashed on it).
  // Impact: the client bundle throws when the route module loads ("Page is
  // not defined"), so the app never renders.
  test.fails(
    'a split component that an unused object names renders (vite)',
    async () => {
      expect(await mountUnusedReader('vite')).toContain('<p>MARK_PAGE</p>')
    },
    60_000,
  )
})
