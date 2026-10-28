/**
 * The router's own APIs that are pure at module level (R79), first
 * `getRouteApi`, are no effect: a module-level `const { useParams } =
 * getRouteApi(…)` only the split component reads loads with its chunk, and
 * the API the route module keeps (its loader reads it) does not pin an
 * effectful declaration before it. Learned from a real app (tamery): five of
 * its six R78 warnings were `getRouteApi` destructurings an inline
 * `validateSearch: type({…})` call after them kept in the route module; the
 * effectful `confetti` before them stays and is the only warning. Recognised
 * by binding to the router package's export, not by name: a renamed import
 * is recognised, an impure argument keeps the call an effect, and
 * `Route.useParams()` inside the split component is unchanged. Vite, Rspack,
 * webpack and Rsbuild builds.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 120_000

/**
 * tamery's shape: an effect (`marker`), then the route's API only the
 * component reads, then a route whose `validateSearch` call stays and runs
 * after both. `api` names the route id the call receives (`MARK_api_…`, so
 * the build output locates the call).
 */
const pinnedAfter = (path: string, imports: string, api: string) =>
  `${head}import { Marker } from '../marker'
import { makeSchema } from '../schema'
${imports}
const marker = new Marker('MARK_${path}_END')
const { useParams } = ${api}
export const Route = createFileRoute('/${path}')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => <p>{marker.name}{String(useParams)}</p>,
})
`

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
  'ids.ts': 'export function routeIdOf(id: string) { return id }\n',
  'routes/direct.tsx': pinnedAfter(
    'direct',
    "import { getRouteApi } from '@tanstack/react-router'",
    "getRouteApi('MARK_api_direct')",
  ),
  'routes/renamed.tsx': pinnedAfter(
    'renamed',
    "import { getRouteApi as routeApiOf } from '@tanstack/react-router'",
    "routeApiOf('MARK_api_renamed')",
  ),
  'routes/impure.tsx': pinnedAfter(
    'impure',
    "import { getRouteApi } from '@tanstack/react-router'\nimport { routeIdOf } from '../ids'",
    "getRouteApi(routeIdOf('MARK_api_impure'))",
  ),
  // the route module keeps the API (its loader reads it): `marker` before
  // it is free to load with the chunk
  'routes/kept.tsx': `${head}import { getRouteApi } from '@tanstack/react-router'
import { Marker } from '../marker'
const marker = new Marker('MARK_kept_END')
const routeApi = getRouteApi('MARK_api_kept')
export const Route = createFileRoute('/kept')({
  loader: () => routeApi.id,
  component: () => <p>{marker.name}{String(routeApi.useParams)}</p>,
})
`,
  'routes/route-params.tsx': `${head}import { Marker } from '../marker'
const marker = new Marker('MARK_route-params_END')
export const Route = createFileRoute('/route-params')({
  component: () => {
    const params = Route.useParams()
    return <p>{marker.name}{JSON.stringify(params)}</p>
  },
})
`,
  'entry.ts': `import { routeTree } from './routeTree.gen'
export { routeTree }
`,
}

const builds: Array<[string, () => Promise<BuildResult>]> = [
  ['vite', () => build({ bundler: 'vite', env: 'client', files })],
  ['rspack', () => build({ bundler: 'rspack', env: 'client', files })],
  ['webpack', () => build({ bundler: 'webpack', env: 'client', files })],
  ['rsbuild', () => buildWithRsbuild({ files, registerCleanup: () => {} })],
]

describe.each(builds)('a %s client build', (_name, create) => {
  test(
    'loads a pure router API call with the chunk that reads it and warns only of the effect before it',
    async () => {
      const app = await create()
      const reported = [...app.warnings, ...app.consoleMessages]
      const warnings = (file: string) =>
        findDiagnostics(reported, {
          file: `routes/${file}.tsx`,
          root: app.root,
        })
      for (const path of ['direct', 'renamed']) {
        expect(app.where(`MARK_api_${path}`), path).toBe('lazy')
        expect(app.where(`MARK_${path}_END`), path).toBe('eager')
        const [warning, ...others] = warnings(path)
        expect(warning!.text, path).toContain('`marker`')
        expect(others, path).toEqual([])
      }
      // an impure argument: the call stays an effect, kept and reported
      expect(app.where('MARK_api_impure')).toBe('eager')
      expect(warnings('impure').map((w) => /`(\w+)`/.exec(w.text)![1])).toEqual(
        expect.arrayContaining(['marker', 'useParams']),
      )
      expect(app.where('MARK_api_kept')).toBe('eager')
      expect(app.where('MARK_kept_END')).toBe('lazy')
      expect(warnings('kept')).toEqual([])
      expect(app.where('MARK_route-params_END')).toBe('lazy')
      expect(warnings('route-params')).toEqual([])
    },
    timeout,
  )
})
