/**
 * A declaration only split code needs that the evaluation-order rules keep
 * in the route module (R29 / R31 (d) / R65, R78) loads with the route
 * instead of with its chunk, and the build or dev server says so once,
 * positioned at the declaration, naming the effect that pins it, its line
 * and the fix. Learned from a real app (tamery): `const confetti = new
 * JSConfetti()` stayed eager because an inline `validateSearch: type({…})`
 * call runs after it and stays in the route module. The same file with the
 * declaration after the route, with the schema declared first, with the
 * call annotated `/* @__PURE__ *\/`, or with
 * a callee declared `/* #__NO_SIDE_EFFECTS__ *\/` in the route file loads
 * the declaration with its chunk and reports nothing; neither does a route
 * whose split code needs nothing pinned. Every host: Vite, Rspack, webpack
 * and Rsbuild builds, and the Vite dev server, where an edit that keeps the
 * finding does not repeat it.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head } from '../build-harness'
import { routerDevServer } from '../dev-server'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 120_000

/** A route whose component reads `marker`, declared before the route options `options`. */
const route = (path: string, before: string, options: string) =>
  `${head}import { Marker } from '../marker'
${before}const marker = new Marker('MARK_${path}_END')
export const Route = createFileRoute('/${path}')({
${options}
  component: () => <p>{marker.name}</p>,
})
`

const pinned = route(
  'pinned',
  "import { makeSchema } from '../schema'\n",
  '  validateSearch: makeSchema({ tab: "string" }),',
)

const files = {
  'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'marker.ts': `export class Marker {
  constructor(public name: string) {
    ;((globalThis as any).marks ??= []).push(name)
  }
}
`,
  'schema.ts': 'export function makeSchema<T>(shape: T) { return shape }\n',
  'routes/pinned.tsx': pinned,
  'routes/pure-call.tsx': route(
    'pure-call',
    "import { makeSchema } from '../schema'\n",
    '  validateSearch: /* @__PURE__ */ makeSchema({ tab: "string" }),',
  ),
  'routes/declared-first.tsx': route(
    'declared-first',
    "import { makeSchema } from '../schema'\nconst search = makeSchema({ tab: 'string' })\n",
    '  validateSearch: search,',
  ),
  'routes/no-side-effects.tsx': route(
    'no-side-effects',
    '/* #__NO_SIDE_EFFECTS__ */ function makeSchema<T>(shape: T) { return shape }\n',
    '  validateSearch: makeSchema({ tab: "string" }),',
  ),
  // the annotated callee declared after the call (hoisted): the
  // annotation counts in any order
  'routes/no-side-effects-after.tsx': `${head}import { Marker } from '../marker'
const marker = new Marker('MARK_no-side-effects-after_END')
export const Route = createFileRoute('/no-side-effects-after')({
  validateSearch: makeSchema({ tab: "string" }),
  component: () => <p>{marker.name}</p>,
})
/* #__NO_SIDE_EFFECTS__ */ function makeSchema<T>(shape: T) { return shape }
`,
  // declared after the route: moving it never crosses the call
  'routes/declared-after.tsx': `${head}import { Marker } from '../marker'
import { makeSchema } from '../schema'
export const Route = createFileRoute('/declared-after')({
  validateSearch: makeSchema({ tab: "string" }),
  component: () => <p>{marker.name}</p>,
})
const marker = new Marker('MARK_declared-after_END')
`,
  'routes/nothing-pinned.tsx': route('nothing-pinned', '', ''),
  'entry.ts': `import { routeTree } from './routeTree.gen'
export { routeTree }
`,
}

const lazyRoutes = [
  'pure-call',
  'declared-first',
  'declared-after',
  'no-side-effects',
  'no-side-effects-after',
  'nothing-pinned',
]

/**
 * The warning of the pinned route, once: positioned at the declaration
 * (where the channel prints positions: Vite's build log prints the
 * message only, while the warning carries its `loc`), naming the
 * declaration, the effect, its option and line, and the fix.
 */
function expectPinnedWarning(
  diagnostics: BuildResult['warnings'],
  root: string,
  positioned: boolean,
) {
  expectDiagnostic(diagnostics, {
    severity: 'warning',
    file: 'routes/pinned.tsx',
    root,
    ...(positioned && {
      position: diagnosticPosition(pinned, 'marker = new'),
    }),
    times: 1,
  })
}

const builds: Array<[string, () => Promise<BuildResult>]> = [
  ['vite', () => build({ bundler: 'vite', env: 'client', files })],
  ['rspack', () => build({ bundler: 'rspack', env: 'client', files })],
  ['webpack', () => build({ bundler: 'webpack', env: 'client', files })],
  ['rsbuild', () => buildWithRsbuild({ files, registerCleanup: () => {} })],
]

describe.each(builds)('a %s client build', (name, create) => {
  test(
    'keeps a declaration an effect after it pins in the route module and warns once; loads the others with their chunk, unreported',
    async () => {
      const app = await create()
      const reported = [...app.warnings, ...app.consoleMessages]
      expect(app.where('MARK_pinned_END')).toBe('eager')
      expectPinnedWarning(reported, app.root, name !== 'vite')
      for (const lazy of lazyRoutes) {
        expect(app.where(`MARK_${lazy}_END`), lazy).toBe('lazy')
        expect(
          findDiagnostics(reported, {
            file: `routes/${lazy}.tsx`,
            root: app.root,
          }),
          lazy,
        ).toEqual([])
      }
    },
    timeout,
  )
})

describe('the Vite dev server', () => {
  test(
    'warns once when the route module is served, and not again after an edit that keeps the finding',
    async () => {
      const server = await routerDevServer({ files })
      await server.transform('/routes/pinned.tsx')
      for (const name of lazyRoutes) {
        await server.transform(`/routes/${name}.tsx`)
      }
      expectPinnedWarning(server.diagnostics, server.root, true)
      for (const name of lazyRoutes) {
        expect(
          findDiagnostics(server.diagnostics, {
            file: `routes/${name}.tsx`,
            root: server.root,
          }),
          name,
        ).toEqual([])
      }
      const since = server.diagnostics.length
      await server.edit({ 'routes/pinned.tsx': `${pinned}// edited\n` })
      expect(await server.transform('/routes/pinned.tsx')).toContain(
        '// edited',
      )
      expect(
        findDiagnostics(server.diagnostics.slice(since), {
          file: 'routes/pinned.tsx',
          root: server.root,
        }),
      ).toEqual([])
    },
    timeout,
  )
})
