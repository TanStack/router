/**
 * An exported component of a route file only its split component renders
 * loads with the route's chunk in a Start client build (the chunk carries
 * its copy; the module the route module re-exports it from is dropped,
 * R77). When a module loaded with the entry imports it through the route
 * file (here the app's router module), the bundler keeps that module with
 * the entry: the build warns once, naming the route file, on Vite and on
 * Rsbuild (SPEC J2.8; the router plugin's hosts do the same).
 *
 * An unexported declaration only the split component reads that a later
 * effect pins in the route module (R31 (d) / R65: an inline
 * `validateSearch: makeSchema({…})` call stays and runs after it) loads
 * with the entry, and the build warns once for the client and server
 * environments together, naming the declaration and the call (R78; every
 * host and reason: router-plugin
 * tests/integration/code-splitter-split-only-eager.test.ts).
 *
 * The router's pure APIs are no such effect (R79): tamery's `const {
 * useSearch } = getRouteApi(…)` between the pinned declaration and the
 * route loads with the chunk and is not reported, imported from the router
 * package or through an app module re-exporting it under another name.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 120_000

const route = `import { createFileRoute } from '@tanstack/react-router'
export function Card() {
  return <b>MARK_CARD</b>
}
function Page() {
  return <Card />
}
export const Route = createFileRoute('/card')({ component: Page })
`

/** The app's own router module (the client entry loads it), importing `Card` through the route file or not. */
const router = (importsCard: boolean) =>
  `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
${importsCard ? "import { Card } from './routes/card'\n;(globalThis as any).Card = Card\n" : ''}export const getRouter = () => createRouter({ routeTree })
`

const files = {
  'src/routes/card.tsx': route,
  'src/router.tsx': router(false),
  'entry.ts': 'export const ok = true\n',
}

describe.each(startBundlers)('a %s client build', (bundler) => {
  test(
    'an exported component only the split component renders loads with its chunk, unreported',
    async () => {
      const build = await buildStart({ bundler, files })
      expect(build.client.where('MARK_CARD')).toBe('lazy')
      expect(
        findDiagnostics(build.diagnostics, {
          file: 'src/routes/card.tsx',
          root: build.root,
        }),
      ).toEqual([])
    },
    timeout,
  )

  test(
    'an exported component the router module imports through the route file loads with the entry, and the build says so once',
    async () => {
      const build = await buildStart({
        bundler,
        files: { ...files, 'src/router.tsx': router(true) },
      })
      expect(build.client.where('MARK_CARD')).toBe('eager+lazy')
      expectDiagnostic(build.client.warnings, {
        severity: 'warning',
        file: 'src/routes/card.tsx',
        root: build.root,
        times: 1,
      })
    },
    timeout,
  )
})

const pinned = `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
import { makeSchema } from '../schema'
const confetti = new Marker('MARK_CONFETTI')
export const Route = createFileRoute('/account')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => <p>{confetti.name}</p>,
})
`

const pinnedFiles = {
  ...files,
  'src/routes/account.tsx': pinned,
  'src/marker.ts': `export class Marker {
  constructor(public name: string) {
    ;((globalThis as any).marks ??= []).push(name)
  }
}
`,
  'src/schema.ts': 'export function makeSchema<T>(shape: T) { return shape }\n',
}

describe.each(startBundlers)('a %s build', (bundler) => {
  test(
    'keeps a declaration a later effect pins in the route module and warns once for every environment',
    async () => {
      const build = await buildStart({ bundler, files: pinnedFiles })
      expect(build.client.where('MARK_CONFETTI')).toBe('eager')
      // what the two environments' bundlers reported (Rsbuild's logger
      // prints each bundler warning again in `build.diagnostics`)
      const reported = [...build.client.warnings, ...build.ssr.warnings]
      expectDiagnostic(reported, {
        severity: 'warning',
        file: 'src/routes/account.tsx',
        root: build.root,
        position: diagnosticPosition(pinned, 'confetti = new'),
        times: 1,
      })
      const [warning] = findDiagnostics(reported, {
        severity: 'warning',
        file: 'src/routes/account.tsx',
        root: build.root,
      })
      for (const part of [
        '`confetti`',
        '`makeSchema(…)`',
        '`validateSearch`',
        `line ${diagnosticPosition(pinned, 'makeSchema({').line}`,
      ]) {
        expect(warning!.text).toContain(part)
      }
      expect(
        findDiagnostics(build.diagnostics, {
          file: 'src/routes/card.tsx',
          root: build.root,
        }),
      ).toEqual([])
    },
    timeout,
  )
})

/** tamery's account route: the route's API between the pinned effect and the route. */
const withRouteApi = (path: string, imports: string, api: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
import { makeSchema } from '../schema'
${imports}
const confetti = new Marker('MARK_CONFETTI_${path}')
const { useSearch } = ${api}
export const Route = createFileRoute('/${path}')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => <p>{confetti.name}{String(useSearch)}</p>,
})
`

const routeApiFiles = {
  ...pinnedFiles,
  'src/routes/direct.tsx': withRouteApi(
    'direct',
    "import { getRouteApi } from '@tanstack/react-router'",
    "getRouteApi('MARK_API_direct')",
  ),
  'src/routes/re-exported.tsx': withRouteApi(
    're-exported',
    "import { routeApiOf } from '../router-api'",
    "routeApiOf('MARK_API_re-exported')",
  ),
  'src/router-api.ts':
    "export { getRouteApi as routeApiOf } from '@tanstack/react-router'\n",
}

describe.each(startBundlers)(
  'a %s build of routes reading their API',
  (bundler) => {
    test(
      'loads the API with the chunk and warns of the effect before it only',
      async () => {
        const build = await buildStart({ bundler, files: routeApiFiles })
        const reported = [...build.client.warnings, ...build.ssr.warnings]
        for (const path of ['direct', 're-exported']) {
          expect(build.client.where(`MARK_API_${path}`), path).toBe('lazy')
          expect(build.client.where(`MARK_CONFETTI_${path}`), path).toBe(
            'eager',
          )
          const warnings = findDiagnostics(reported, {
            severity: 'warning',
            file: `src/routes/${path}.tsx`,
            root: build.root,
          })
          expect(warnings, path).toHaveLength(1)
          expect(warnings[0]!.text, path).toContain('`confetti`')
        }
      },
      timeout,
    )
  },
)
