// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Code-splitter cases in real client builds: page code that loads with its
 * chunk, per bundler and side-effect hint.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { build, buildWithRsbuild, head } from '../build-harness'
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
  // export, and exported functions and classes (the chunk declares its own
  // copy of a function whose closure is functions and primitives, by rule;
  // a class and state are one instance the chunk imports from the extracted
  // module, pinned in "module state shared with split chunks" and "exported
  // bindings"; the bundler drops an unused extracted module of the route
  // file, and the hosts' `sideEffects: false` rule for `tsr-split=export---`
  // keeps an imported one lazy without `"sideEffects": false`). A fix must
  // keep them out of the entry chunk.
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
    routeCase(
      'an exported function component',
      'exported-function',
      `export function Card() {
  return <b>{'$MARK'}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'a function component exported by specifier',
      'exported-specifier',
      `function Card() {
  return <b>{'$MARK'}</b>
}
export { Card }
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'a default-exported function component',
      'exported-default',
      `export default function Card() {
  return <b>{'$MARK'}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'an exported helper function',
      'exported-helper',
      `export function format(value: number) {
  return '$MARK' + value
}
function Page() {
  return <p>{format(1)}</p>
}
${component}`,
    ),
    routeCase(
      'an exported class',
      'exported-class',
      `export class Store {
  value = '$MARK'
}
function Page() {
  return <p>{new Store().value}</p>
}
${component}`,
    ),
    routeCase(
      'an exported function over module state',
      'exported-state',
      `let count = 0
export function next() {
  count++
  return '$MARK' + count
}
function Page() {
  return <p>{next()}</p>
}
${component}`,
    ),
    // A dependency with side effects next to the exported component: only
    // the declaration is asserted, how the bundler groups the modules next
    // to it is up to it. (A client build bundles `react/jsx-runtime`, a
    // CommonJS module, whose interop call has side effects too.)
    // Source: #8504 (code-splitter-exported-bindings-chunks.test.ts).
    routeCase(
      'an exported function component with a dependency that has side effects',
      'exported-effect-dep',
      `import { label } from '../label'
export function Card() {
  return <b>{'$MARK' + label}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
    // What an exported function component imports loads with the chunk too.
    // Source: #8504 (code-splitter-exported-bindings-chunks.test.ts).
    {
      ...routeCase(
        "an exported function component's dependency",
        'exported-dep',
        `import { heavy } from '../heavy'
export function Card() {
  return <b>{heavy()}</b>
}
function Page() {
  return <Card />
}
${component}`,
      ),
      marker: 'MARK_heavy_dependency_END',
    },
    // Whether it renders is pinned at the compiler level ("top-level writes
    // to the split component (property assignment) stay with the binding
    // they write"); a fix must keep the component in its chunk.
    // Source: review of #8504 (a candidate fix moved the component to the
    // entry).
    routeCase(
      'an exported function component next to a helper the loader and the component share',
      'shared-helper-export',
      `const label = (value: string) => value + '!'
export function Card() {
  return <b>{'$MARK'}</b>
}
export const Route = createFileRoute('$PATH')({
  loader: () => label('data'),
  component: () => <p>{label('page')}<Card /></p>,
})`,
    ),
  ]

  const rootRoute = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
  errorComponent: () => <p>{'MARK_root_error_END'}</p>,
  notFoundComponent: () => <p>{'MARK_root_not_found_END'}</p>,
})
`
  const cases = [...controls]
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
      registerCleanup?: () => void
    },
  ) =>
    bundler === 'rsbuild'
      ? buildWithRsbuild(options)
      : build({ bundler, env: 'client', ...options })

  describe.each([...clientBundlers, 'rsbuild'] as const)('%s', (bundler) => {
    describe.each([
      { hint: 'without a sideEffects field', sideEffects: undefined },
      { hint: 'with "sideEffects": false', sideEffects: false },
    ])('$hint', ({ sideEffects }) => {
      let built: Promise<BuildResult> | undefined
      const app = () =>
        (built ??= clientBuild(bundler, {
          sideEffects,
          files,
          registerCleanup: () => {},
        }))
      afterAll(async () => {
        await (await built)?.dispose()
      })
      const timeout = 120_000
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

      test.each(controls)(
        '$name loads with its chunk',
        async (row) => {
          expect(await outcome(row)).toEqual(lazyAndRendered)
        },
        timeout,
      )
    })
  })
})
