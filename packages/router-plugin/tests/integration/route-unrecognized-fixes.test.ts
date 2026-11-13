/**
 * A listed route file whose `Route` the code splitter does not read
 * (J2.10, design 5): it is reported naming the file when the router's own
 * route constructor is misused, and the fix the report offers makes it a
 * route the splitter reads (R101: each offered fix applied here). A route
 * made by the app's own helper is reported nothing (R130), whatever else
 * the file imports from the router package. Source: REVIEW-design5-final
 * findings 3 and 4 (the report named a false cause, offered fixes that drop
 * a root's context or name the wrong constructor in a lazy file, and
 * warned about app helpers).
 */
import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build } from '../build-harness'
import { expectValidModules, loadRoute } from '../route-app'

const RP = '@tanstack/react-router'
const timeout = 60_000

const rootFile = `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`
const page = `{ component: () => <p>MARK_PAGE</p> }`

/** A client build of an app of file routes (`routes/`) whose entry is its route tree. */
async function buildApp(files: Record<string, string>) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files: {
      'routes/__root.tsx': rootFile,
      'entry.ts': `export { routeTree } from './routeTree.gen'\n`,
      ...files,
    },
  })
  return { app, diagnostics: [...app.warnings, ...app.consoleMessages] }
}

interface Row {
  name: string
  /** The route file reported. */
  file: string
  /** The app as written. */
  files: Record<string, string>
  /** The app with the fix the report offers. */
  fixed: Record<string, string>
  /** The fixed route's component is split (not for a root or a lazy file). */
  split: boolean
  /** The text the report points at, when the row checks the printed position. */
  at?: string
}

const rows: Array<Row> = [
  {
    name: 'a route constructor called without its options call',
    file: 'routes/index.tsx',
    files: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/')
`,
    },
    fixed: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/')(${page})
`,
    },
    split: true,
    at: "Route = createFileRoute('/')\n",
  },
  {
    name: 'the context root constructor without its context call',
    file: 'routes/__root.tsx',
    files: {
      'routes/__root.tsx': `import { Outlet, createRootRouteWithContext } from '${RP}'
export const Route = createRootRouteWithContext({ component: () => <Outlet /> })
`,
    },
    fixed: {
      'routes/__root.tsx': `import { Outlet, createRootRouteWithContext } from '${RP}'
interface Ctx { user?: string }
export const Route = createRootRouteWithContext<Ctx>()({ component: () => <Outlet /> })
`,
    },
    split: false,
  },
  {
    name: 'the root constructor called twice',
    file: 'routes/__root.tsx',
    files: {
      'routes/__root.tsx': `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute()({ component: () => <Outlet /> })
`,
    },
    fixed: { 'routes/__root.tsx': rootFile },
    split: false,
  },
  {
    name: 'the root constructor called twice in a file route',
    file: 'routes/index.tsx',
    files: {
      'routes/index.tsx': `import { createRootRoute } from '${RP}'
export const Route = createRootRoute()(${page})
`,
    },
    fixed: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/')(${page})
`,
    },
    split: true,
  },
  {
    name: 'a wrapped route call',
    file: 'routes/index.tsx',
    files: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
const wrap = <T,>(route: T) => route
export const Route = wrap(createFileRoute('/')(${page}))
`,
    },
    fixed: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/')(${page})
`,
    },
    split: true,
  },
  {
    name: 'a wrapped route call in a lazy route file',
    file: 'routes/index.lazy.tsx',
    files: {
      'routes/index.lazy.tsx': `import { createLazyFileRoute } from '${RP}'
const wrap = <T,>(route: T) => route
export const Route = wrap(createLazyFileRoute('/')(${page}))
`,
    },
    fixed: {
      'routes/index.lazy.tsx': `import { createLazyFileRoute } from '${RP}'
export const Route = createLazyFileRoute('/')(${page})
`,
    },
    split: false,
  },
  {
    name: 'route options in a `let` that is reassigned',
    file: 'routes/index.tsx',
    files: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
let options = ${page}
options = { ...options }
export const Route = createFileRoute('/')(options)
`,
    },
    fixed: {
      'routes/index.tsx': `import { createFileRoute } from '${RP}'
const options = ${page}
export const Route = createFileRoute('/')(options)
`,
    },
    split: true,
  },
]

describe('a listed route the code splitter does not read', () => {
  it.for(rows)(
    '$name is reported, and the offered fix is read',
    { timeout },
    async ({ file, files, fixed, split, at }) => {
      const before = await buildApp(files)
      expectDiagnostic(before.diagnostics, {
        severity: 'warning',
        file,
        root: before.app.root,
      })
      if (at !== undefined) {
        // the printed warning names the 1-based position (R101): a Vite
        // build prints no location field of a warning, only its message
        const { line, column } = diagnosticPosition(files[file]!, at)
        expect(before.diagnostics.map((d) => d.text).join('\n')).toContain(
          `${file}:${line}:${column}`,
        )
      }

      const after = await buildApp(fixed)
      expectNoProblems(after.diagnostics)
      if (split) {
        expect(after.app.where('MARK_PAGE')).toBe('lazy')
      }
    },
  )
})

// (a dev server: the production build of such an app fails on the name
// the type-only import leaves undeclared)
it(
  'a route constructor imported as a type only is reported, and the offered fix is read',
  { timeout },
  async () => {
    const before = await loadRoute(
      `import type { createFileRoute } from '${RP}'
export const Route = createFileRoute('/x')(${page})
`,
      { routeId: '/x', fresh: true },
    )
    await before.transform()
    expectDiagnostic(await before.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: before.host.root,
    })

    const after = await loadRoute(
      `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/x')(${page})
`,
      { routeId: '/x', fresh: true },
    )
    await expectValidModules(after)
    expect(await after.isLazy('component')).toBe(true)
    expectNoProblems(await after.diagnostics())
  },
)

const helper = {
  'lib/app-route.ts': `import { createFileRoute } from '${RP}'
export const createAppRoute = (id: any) => (options: any) => createFileRoute(id)(options)
`,
}

describe("a route made by the app's own helper (R130)", () => {
  it.for([
    {
      name: 'in a file using the router package through a namespace import',
      route: `import * as R from '${RP}'
import { createAppRoute } from '../lib/app-route'
export const Route = createAppRoute('/')({
  component: () => <R.Link to="/">MARK_PAGE</R.Link>,
})
`,
    },
    {
      name: 'in a file importing a route constructor for something else',
      route: `import { createFileRoute } from '${RP}'
import { createAppRoute } from '../lib/app-route'
export const makeRoute = createFileRoute
export const Route = createAppRoute('/')(${page})
`,
    },
  ])('$name is reported nothing', { timeout }, async ({ route }) => {
    const { diagnostics } = await buildApp({
      ...helper,
      'routes/index.tsx': route,
    })
    expectNoProblems(diagnostics)
  })
})
