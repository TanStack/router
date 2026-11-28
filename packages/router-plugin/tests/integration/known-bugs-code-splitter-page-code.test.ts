// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts the correct behaviour for a bug
 * main had; the ones today's compiler still fails are marked .fails
 * (oracle/KNOWN-BUGS.md, "Remaining pins").
 */

import { afterAll, describe, expect, test } from 'vitest'
import { buildShared, buildSharedWithRsbuild, head } from '../build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'

/**
 * Bundlers whose router plugin splits routes (the esbuild adapter does not;
 * pinned in build-harness.test.ts).
 */
const clientBundlers: Array<Bundler> = ['vite', 'rspack', 'webpack']

/**
 * Where a route's code ends up in a client build, which the bundler decides
 * from what the code splitter emits, with or without side-effect hints. One
 * app per bundler and hint holds a route file per case, each marking its
 * page code with a marker; its entry imports the generated route tree, which
 * imports only `Route` from each route file, like an app.
 */
describe('page code in client builds', () => {
  type Case = {
    name: string
    /** Route file name in `routes/`; its path is `/<file>`. */
    file: string
    /** The route file after the `createFileRoute` import, with `$PATH`. */
    route: string
    marker: string
  }

  const page = (file: string, body: string): Case['route'] =>
    `${head}${body}`.replaceAll('$PATH', `/${file}`)

  const marker = (file: string) => `MARK_${file.replaceAll('-', '_')}_END`

  const routeCase = (name: string, file: string, body: string): Case => ({
    name,
    file,
    route: page(file, body.replaceAll('$MARK', marker(file))),
    marker: marker(file),
  })

  const component = `export const Route = createFileRoute('$PATH')({ component: Page })`

  // Page code that loads with its chunk: code the route file does not
  // export. (An exported binding stays in the route file, as on main: R153.)
  // A fix must keep it out of the entry chunk.
  const controls: Array<Case> = [
    routeCase(
      'a const only a split component renders',
      'local-const',
      `const Card = () => <b>{'$MARK'}</b>
function Page() {
  return <Card />
}
${component}`,
    ),
  ]
  // Root routes are not split (R60, SPEC J2.7): their components render on
  // every page or on error and not-found responses, where a lazy chunk only
  // adds a round trip, so its errorComponent and notFoundComponent load with
  // the root route module.
  const rootRoute = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
  errorComponent: () => <p>{'MARK_root_error_END'}</p>,
  notFoundComponent: () => <p>{'MARK_root_not_found_END'}</p>,
})
`
  const rootMarkers = {
    errorComponent: 'MARK_root_error_END',
    notFoundComponent: 'MARK_root_not_found_END',
  }

  // Bug: a split chunk keeps the route file's exported declarations that
  // its option does not read (SPEC J2.5; compiler-level pin in "what
  // split chunks hold"), and bundlers keep them.
  const unreadExport = routeCase(
    'an exported helper the split option does not read',
    'unread-export',
    `export function helper() {
  return '$MARK'
}
function Page() {
  return <p>page</p>
}
${component}`,
  )

  const cases = [...controls, unreadExport]
  /**
   * `mount(path)` mounts the component of the route at `path` into #root;
   * `renderEach(paths)` mounts each into its own element and returns what
   * each renders (or the error it throws), by path.
   */
  const mountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export { routeTree }
// The routes as a router sees them (their public \`fullPath\`)
const router = createRouter({ routeTree, history: createMemoryHistory() })
async function mountInto(path: string, element: HTMLElement) {
  const route = (router.routesByPath as Record<string, any>)[path]
  await route.options.component.preload?.()
  const root = createRoot(element)
  flushSync(() => root.render(createElement(route.options.component)))
}
/** Mounts the component of the route at \`path\` into #root. */
export async function mount(path: string) {
  await mountInto(path, document.getElementById('root')!)
}
export async function renderEach(paths: Array<string>) {
  const rendered: Record<string, string> = {}
  for (const path of paths) {
    const element = document.createElement('div')
    document.body.append(element)
    try {
      await mountInto(path, element)
      rendered[path] = element.innerHTML
    } catch (error) {
      rendered[path] = 'threw: ' + String(error)
    }
  }
  return rendered
}
`
  const files = {
    'label.ts': `;(globalThis as any).labelLoaded = true
export const label = 'label'
`,
    'heavy.ts': `export function heavy() {
  return 'MARK_heavy_dependency_END'
}
`,
    'routes/__root.tsx': rootRoute,
    ...Object.fromEntries(
      cases.map((row) => [`routes/${row.file}.tsx`, row.route]),
    ),
    'entry.ts': mountEntry,
  }

  /**
   * A production client build of `files` with `bundler`, or with Rsbuild
   * and its production defaults (`rsbuild`).
   */
  const clientBuild = (
    bundler: Bundler | 'rsbuild',
    options: {
      sideEffects: boolean | undefined
      files: Record<string, string>
    },
  ) =>
    bundler === 'rsbuild'
      ? buildSharedWithRsbuild(options)
      : buildShared({ bundler, env: 'client', ...options })

  describe.each([...clientBundlers, 'rsbuild'] as const)('%s', (bundler) => {
    describe.each([
      { hint: 'without a sideEffects field', sideEffects: undefined },
      { hint: 'with "sideEffects": false', sideEffects: false },
    ])('$hint', ({ sideEffects }) => {
      let built: Promise<BuildResult> | undefined
      const app = () => (built ??= clientBuild(bundler, { sideEffects, files }))
      afterAll(async () => {
        await (await built)?.dispose()
      })
      let renders: Promise<Record<string, string>> | undefined
      /** What the route of each case renders when mounted, by file. */
      const rendered = async (file: string) => {
        renders ??= app().then(async (result) => {
          const paths = cases.map((row) => `/${row.file}`)
          const run = await result.run(
            `return await entry.renderEach(${JSON.stringify(paths)})`,
          )
          return run.result as Record<string, string>
        })
        return (await renders)[`/${file}`]
      }
      /**
       * Where the case's marked page code is in the build, and whether its
       * route renders it: the page code must load with its chunk and still
       * work.
       */
      const outcome = async ({ file, marker: mark }: Case) => ({
        placement: (await app()).where(mark),
        rendersPage: (await rendered(file))?.includes(mark),
      })
      const lazyAndRendered = { placement: 'lazy', rendersPage: true }

      test.each(controls)('$name loads with its chunk', async (row) => {
        expect(await outcome(row)).toEqual(lazyAndRendered)
      })

      // One cell per bundler kind: Vite and a webpack-family bundler.
      if (
        sideEffects === undefined &&
        (bundler === 'vite' || bundler === 'rspack')
      ) {
        test("a root route's components load with the route module", async () => {
          const built = await app()
          expect({
            errorComponent: built.where(rootMarkers.errorComponent),
            notFoundComponent: built.where(rootMarkers.notFoundComponent),
          }).toEqual({ errorComponent: 'eager', notFoundComponent: 'eager' })
        })
      }

      test(`${unreadExport.name} is not in its chunk`, async () => {
        expect((await app()).locate(unreadExport.marker).lazy).toEqual([])
      })
    })
  })
})
