// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/known-bugs-code-splitter.test.ts.
/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
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
  // export, and exported functions and classes (today the chunk declares its
  // own copy, whose identity and state are pinned in "module state shared
  // with split chunks" and "exported bindings", and the bundler drops the
  // unused export of the route module). A fix must keep them out of the
  // entry chunk.
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

  // Bug: page code the route file exports as a variable, and an exported
  // split component, stay in the route module, which the entry chunk loads,
  // with everything they import: a split chunk imports exported variables
  // from the route module instead of owning them, and an exported component
  // is not split (the code splitter warns). Bundlers can only move the code
  // out with the export unused, which the generated route tree (importing
  // `Route` only) allows; whether our compiler or the bundler's
  // tree-shaking does it is free, with or without `"sideEffects": false` or
  // a `/* @__PURE__ */` initialiser.
  // Source: #8504's exported-bindings chunks tests.
  // Impact: page code exported for tests or reuse loads with the entry chunk.
  const exported: Array<Case> = [
    routeCase(
      'an exported const component only the split component renders',
      'exported-const',
      `export const Card = () => <b>{'$MARK'}</b>
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'an exported const with a pure initialiser',
      'exported-pure',
      `function makeLabel(value: string) {
  return { text: value }
}
export const label = /* @__PURE__ */ makeLabel('$MARK')
function Page() {
  return <p>{label.text}</p>
}
${component}`,
    ),
    routeCase(
      'an exported function used as the component',
      'exported-component',
      `export function Page() {
  return <p>{'$MARK'}</p>
}
${component}`,
    ),
    routeCase(
      'a default-exported function used as the component',
      'exported-default-component',
      `export default function Page() {
  return <p>{'$MARK'}</p>
}
${component}`,
    ),
    // Source: review of #8504.
    routeCase(
      'an exported const used as the component',
      'exported-const-component',
      `export const Page = () => <p>{'$MARK'}</p>
${component}`,
    ),
    routeCase(
      "an exported component another route's split component renders",
      'exported-shared',
      `export function Card() {
  return <b>{'$MARK'}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
  ]

  // Bug: an exported component that two split options render goes to a
  // module both chunks import, which the route module re-exports, so it
  // loads with the entry chunk unless the app declares `"sideEffects":
  // false` (then the bundler drops the unused re-export).
  // Source: review of #8504.
  const exportedSharedByOptions = routeCase(
    'an exported component two split options render',
    'exported-two-options',
    `export function Card() {
  return <b>{'$MARK'}</b>
}
export const Route = createFileRoute('$PATH')({
  component: () => <p><Card /></p>,
  errorComponent: () => <p><Card /></p>,
})`,
  )

  // Goals for split options the code splitter leaves in the route module.
  const unsplit: Array<Case> = [
    // Bug: a route option written as a method (`component() {}`) is not
    // split (only property values are). SPEC J2.9: method shorthand
    // options are splittable like any other.
    // Impact: the component loads with the entry chunk.
    routeCase(
      'a component written as a method',
      'method-component',
      `export const Route = createFileRoute('$PATH')({
  component() {
    return <p>{'$MARK'}</p>
  },
})`,
    ),
  ]

  // Bug: the root route's options are never split
  // (`computeSharedBindings` and the reference compiler skip
  // `createRootRoute`), so its errorComponent and notFoundComponent, which
  // only render on errors, load with the entry chunk. Its `component`
  // renders on every page and may stay (SPEC J2.7).
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

  // Bug: route options destructured from a call result
  // (`const { component, loader } = createBits()`) are neither split nor
  // reported: the destructuring moves to a module the route module imports
  // statically, so the component's code loads with the entry, silently.
  // Splitting them would change when the call runs, so the user has to
  // change the pattern: a warning naming the file and the option is the
  // expected outcome (SPEC J2.8, G5).
  const destructured = routeCase(
    'route options destructured from a call result',
    'destructured-options',
    `function DefaultComponent() {
  return <div>Default</div>
}
const createBits = () => ({ component: ActualComponent, loader: () => 'data' })
const { component: MyComponent = DefaultComponent, loader } = createBits()
function ActualComponent() {
  return <div>{'$MARK'}</div>
}
export const Route = createFileRoute('$PATH')({ component: MyComponent, loader })`,
  )

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

  const cases = [
    ...controls,
    ...exported,
    ...unsplit,
    exportedSharedByOptions,
    destructured,
    unreadExport,
  ]
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
    // Renders the exported component of `exported-shared` in its split
    // component.
    'routes/imports-exported.tsx': `${head}import { Card } from './exported-shared'
function Page() {
  return <Card />
}
export const Route = createFileRoute('/imports-exported')({ component: Page })
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

      // A component the route file writes a property of, per bundler and
      // hint: known-bugs-code-splitter-property-write.test.ts (its own apps).

      test.fails.each([...exported, ...unsplit])(
        '$name loads with its chunk',
        async (row) => {
          expect(await outcome(row)).toEqual(lazyAndRendered)
        },
        timeout,
      )
      ;(sideEffects === false ? test : test.fails)(
        `${exportedSharedByOptions.name} loads with its chunk`,
        async () => {
          expect(await outcome(exportedSharedByOptions)).toEqual(
            lazyAndRendered,
          )
        },
        timeout,
      )

      test.fails.each(['errorComponent', 'notFoundComponent'] as const)(
        "a root route's %s loads lazily",
        async (option) => {
          expect((await app()).where(rootMarkers[option])).toBe('lazy')
        },
        timeout,
      )

      test.fails(
        `${destructured.name} load with their chunk or are reported`,
        async () => {
          const built = await app()
          const reported =
            findDiagnostics([...built.warnings, ...built.consoleMessages], {
              severity: 'warning',
              file: `routes/${destructured.file}.tsx`,
              root: built.root,
            }).length > 0
          expect({
            lazy: built.where(destructured.marker) === 'lazy',
            reported,
          }).not.toEqual({ lazy: false, reported: false })
        },
        timeout,
      )

      test.fails(
        `${unreadExport.name} is not in its chunk`,
        async () => {
          expect((await app()).locate(unreadExport.marker).lazy).toEqual([])
        },
        timeout,
      )
    })
  })
})
