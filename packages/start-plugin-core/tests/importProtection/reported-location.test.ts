/**
 * Where import protection tells the user a violation is: the location it
 * reports for the importer (`Importer: file:line:column`) should be the use
 * of the denied import that leaks into the environment, in the user's
 * source. Read from what a real app reports with Start's default rules: the
 * Vite dev server's warnings (mock mode), and the errors of an Rsbuild dev
 * server and of Vite and Rsbuild builds (error mode). The Vite and Rsbuild
 * adapters look for the use in a different order (Vite: compiled code first,
 * Rsbuild: original source first), so each case runs on both.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-harness'
import { startRsbuildDevServer } from '../rsbuild-dev-server'
import {
  distinct,
  locationIn,
  reactRuntimeFiles,
  rejection,
  reportedViolations,
  startProtectedDevServer,
} from './start-apps'

const timeout = 60_000

type Channel = 'vite dev' | 'rsbuild dev' | 'vite build' | 'rsbuild build'

/**
 * The importer locations reported for an app whose `src/a.tsx` is `code`
 * (imported by the entry `src/entry.ts`) and imports from the denied
 * `src/secret.server.ts`.
 */
async function reportedLocations(
  channel: Channel,
  code: string,
): Promise<Array<string>> {
  const files = {
    ...reactRuntimeFiles,
    'src/secret.server.ts': `export const eq = () => 1
export const secret = () => 'secret'
export default function Secret() {
  return 'secret'
}
`,
    'src/a.tsx': code,
    'src/entry.ts': `export * from './a'\n`,
  }
  let output: string | Array<string>
  if (channel === 'vite dev') {
    const server = await startProtectedDevServer(files)
    await server.load('/src/entry.ts')
    output = server.logs
  } else if (channel === 'rsbuild dev') {
    const server = await startRsbuildDevServer({
      files,
      importProtection: { behavior: 'error' },
      // Rsbuild's default source maps in development
      config: { output: { sourceMap: { js: 'cheap-module-source-map' } } },
    })
    output = server.errors
  } else {
    const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
    output = (
      await rejection(buildStart({ bundler, files, entry: 'src/entry.ts' }))
    ).message
  }
  return distinct(reportedViolations(output).map((report) => report.importer))
}

interface LocationCase {
  name: string
  code: string
  /** The locations the report may point at (`src/a.tsx:line:column`). */
  expected: Array<string>
}

const at = (code: string, line: number, needle: string) =>
  locationIn('src/a.tsx', code, line, needle)

const afterHandler = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const fn = createServerFn().handler(async () => secret())
export const leak = () => secret()
`

const memberProperty = `import { eq } from './secret.server'
const db = { eq: (n: number) => n }
export const a = db.eq(1)
export const b = eq
`

const typePosition = `import { secret } from './secret.server'
type Secret = typeof secret
export const check = (value: Secret) => value
export const leak = secret
`

const jsxElement = `import Secret from './secret.server'
export const Page = () => <Secret />
`

const cases: Record<string, LocationCase> = {
  afterHandler: {
    name: 'a use after a server fn handler (the handler is not reported)',
    code: afterHandler,
    expected: [at(afterHandler, 4, 'secret()')],
  },
  memberProperty: {
    name: 'a use after a member property named like the import',
    code: memberProperty,
    expected: [at(memberProperty, 4, 'eq')],
  },
  typePosition: {
    name: 'a use after a type position',
    code: typePosition,
    expected: [at(typePosition, 4, 'secret')],
  },
  jsxElement: {
    name: 'a JSX element',
    code: jsxElement,
    expected: [at(jsxElement, 2, '<Secret'), at(jsxElement, 2, 'Secret')],
  },
}

const channels: Array<Channel> = [
  'vite dev',
  'rsbuild dev',
  'vite build',
  'rsbuild build',
]

/** The rows of `cases` on `channels`. */
const rows = (names: Array<string>, on: Array<Channel>) =>
  names.flatMap((name) => on.map((channel) => ({ ...cases[name]!, channel })))

describe('the reported location of a violation is the leaking use', () => {
  test.each([
    ...rows(['afterHandler'], channels),
    ...rows(['typePosition', 'jsxElement'], ['vite dev', 'vite build']),
  ])(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
    },
    timeout,
  )

  // Bug: the usage lookup counts a member property named like a denied import
  // (`db.eq`) as a use of the import (shared `findPostCompileUsagePos` /
  // `findOriginalUnsafeUsagePos` in import-protection/analysis.ts, used by
  // both adapters).
  // Impact: the violation points at an unrelated line, so the user looks for
  // the leak in the wrong place.
  // Source: PR #8504 (analysis.usage.test.ts "ignores a member property named
  // like the import but still finds later usage"); moved from the pin on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(rows(['memberProperty'], channels))(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
    },
    timeout,
  )

  // Bug: the original-source usage lookup, which the Rsbuild adapter tries
  // first, counts uses in type positions (`typeof secret`), which TypeScript
  // erases, and does not count a JSX element (`<Secret />`) as a use; the
  // compiled-code lookup it then falls back to reports compiled-code
  // coordinates when the module has no column source map (production builds,
  // and Rsbuild's default `cheap-module-source-map` in development).
  // Impact: on Rsbuild, the violation points at a type annotation, or at a
  // line/column that does not exist in the user's file.
  // Source: PR #8504 (analysis.usage.test.ts "ignores type positions, which
  // TypeScript erases", "finds $name usage"); moved from the pins on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(
    rows(['typePosition', 'jsxElement'], ['rsbuild dev', 'rsbuild build']),
  )(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
    },
    timeout,
  )
})
