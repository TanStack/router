/**
 * Import protection judges the file the bundle contains in Rsbuild's RSC
 * layer (SPEC J6.1, J6.3; J4.3: the provider resolves with the
 * `react-server` condition). Start's Rsbuild plugin gives the modules of
 * the layer `react-server` through rule `resolve` options; the file and
 * marker rules apply to the file Rspack resolved there, not to the file
 * another environment's conditions name.
 *
 * The app's `package.json` maps two specifiers by condition (`imports`):
 * - `#where`: `react-server` names an ordinary server file, `default` a
 *   `.client` file and a file marked client-only: nothing to report, the
 *   provider runs the server file;
 * - `#leak`: `react-server` names a `.client` file, `default` an ordinary
 *   one; `#leakMarked` the same with a file marked client-only: both are
 *   violations in the server environment.
 * A server function's handler imports them (its provider compiles in the
 * RSC layer), a route's loader calls it. Vite's provider environment
 * (`rsc`) is the dev twin.
 */
import { describe, expect, test } from 'vitest'
import {
  startRscDevServer,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
} from './rsc-app'

const timeout = 60_000

/** What the app's import protection reported (`onViolation`). */
interface Violation {
  env: string
  type: string
  specifier: string
  resolved?: string
}

const packageJson = (imports: Record<string, unknown>) =>
  JSON.stringify({ name: 'app', private: true, type: 'module', imports })

const whereFiles = {
  'src/where/server.ts': `export const where = () => 'MARK_SERVER'\n`,
  'src/where/where.client.ts': `export const where = () => 'MARK_CLIENT_FILE'\n`,
  'src/where/marked.ts': `import '@tanstack/react-start/client-only'
export const where = () => 'MARK_CLIENT_MARKED'
`,
}
const whereImports = {
  '#where': {
    'react-server': './src/where/server.ts',
    default: './src/where/where.client.ts',
  },
  '#whereMarked': {
    'react-server': './src/where/server.ts',
    default: './src/where/marked.ts',
  },
}

const leakFiles = {
  'src/leak/leak.client.ts': `export const leak = () => 'MARK_LEAK_FILE'\n`,
  'src/leak/marked.ts': `import '@tanstack/react-start/client-only'
export const leak = () => 'MARK_LEAK_MARKED'
`,
  'src/leak/plain.ts': `export const leak = () => 'MARK_PLAIN'\n`,
}
const leakImports = {
  '#leak': {
    'react-server': './src/leak/leak.client.ts',
    default: './src/leak/plain.ts',
  },
  '#leakMarked': {
    'react-server': './src/leak/marked.ts',
    default: './src/leak/plain.ts',
  },
}

/** A server fn whose handler reads `specifiers`, and a route calling it. */
const appFiles = (specifiers: Array<string>) => ({
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
${specifiers.map((specifier, index) => `import { ${specifier.startsWith('#where') ? 'where' : 'leak'} as read${index} } from '${specifier}'`).join('\n')}
export const read = createServerFn().handler(() => [${specifiers.map((_, index) => `read${index}()`).join(', ')}].join(' '))
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { read } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => read(),
  component: Page,
})
function Page() {
  return <p data-testid="label">read {Route.useLoaderData()}</p>
}
`,
})

const recorder = () => {
  const violations: Array<Violation> = []
  return {
    violations,
    start: {
      importProtection: {
        onViolation: (info: Violation) => {
          violations.push(info)
        },
      },
    },
  }
}

/** The violations by environment, kind, specifier and resolved file. */
const summary = (violations: Array<Violation>) =>
  [
    ...new Set(
      violations.map(
        ({ env, type, specifier, resolved }) =>
          `${env} ${type} ${specifier} ${resolved?.split('/').slice(-2).join('/')}`,
      ),
    ),
  ].sort()

/** The violations of the leaking specifiers, in the provider's environment. */
const leakViolations = (env: string) => [
  `${env} file #leak leak/leak.client.ts`,
  `${env} marker #leakMarked leak/marked.ts`,
]

const devFiles = {
  'package.json': packageJson({ ...whereImports, ...leakImports }),
  ...whereFiles,
  ...leakFiles,
  ...appFiles(['#where', '#whereMarked', '#leak', '#leakMarked']),
}

/**
 * The provider's environment and the page of a dev server, per host. Vite's
 * provider is an environment of its own (`rsc`, `react-server` among its
 * conditions): the twin of the Rsbuild layer.
 */
const devHosts = {
  'Rsbuild dev': async (start: Record<string, unknown>) => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      start,
      files: devFiles,
    })
    const page = await (await fetch(new URL('/', server.url))).text()
    return { env: 'ssr', page }
  },
  'Vite dev': async (start: Record<string, unknown>) => {
    const server = await startRscDevServer({
      listen: true,
      start,
      files: devFiles,
    })
    return { env: 'rsc', page: (await server.fetch('/')).body }
  },
}

describe.each(Object.keys(devHosts) as Array<keyof typeof devHosts>)(
  '%s with RSC',
  (host) => {
    test(
      'the provider judges the files its react-server condition resolves',
      async () => {
        const { violations, start } = recorder()
        const { env, page } = await devHosts[host](start)
        // (the denied files are served as their mocks)
        expect(page).toContain('MARK_SERVER MARK_SERVER')
        expect(page).not.toMatch(/MARK_LEAK_|MARK_PLAIN|MARK_CLIENT_/)
        expect(summary(violations)).toEqual(leakViolations(env))
      },
      timeout,
    )
  },
)

describe('Rsbuild build with RSC', () => {
  test(
    'a file only the default condition names is not reported',
    async () => {
      const { violations, start } = recorder()
      const server = await startRscRsbuildPreviewServer({
        start,
        files: {
          'package.json': packageJson(whereImports),
          ...whereFiles,
          ...appFiles(['#where', '#whereMarked']),
        },
      })
      expect(server.errors).toEqual([])
      expect(summary(violations)).toEqual([])
      const page = await (await fetch(new URL('/', server.url))).text()
      expect(page).toContain('MARK_SERVER MARK_SERVER')
    },
    timeout,
  )

  test(
    'a denied file only the react-server condition names fails the build',
    async () => {
      const { violations, start } = recorder()
      const built = await startRscRsbuildPreviewServer({
        start,
        files: {
          'package.json': packageJson(leakImports),
          ...leakFiles,
          ...appFiles(['#leak', '#leakMarked']),
        },
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(built).toBeInstanceOf(AggregateError)
      expect(summary(violations)).toEqual(leakViolations('ssr'))
    },
    timeout,
  )
})
