/**
 * Two calls of the router's `createFileRoute` in one Start route file (SPEC
 * J2.11, R172): not supported, so the client build fails at the call not
 * bound to `Route`, whatever its options hold (only the route's own call has
 * `server`, `ssr` and `headers` removed).
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

/** The app's root route: the route file is one the generator lists. */
const root = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
}

function build(bundler: (typeof startBundlers)[number], route: string) {
  return buildStart({
    bundler,
    files: {
      ...root,
      'src/routes/x.tsx': `import { createFileRoute } from '@tanstack/react-router'
${route}`,
      'src/entry.ts': `export { Route } from './routes/x'\n`,
    },
    entry: 'src/entry.ts',
  })
}

const server = `server: { handlers: { GET: async () => new Response('MARK_SERVER_SECRET') } }`

describe.each(startBundlers)('%s build', (bundler) => {
  test.each([
    { key: 'server', option: server },
    {
      key: 'ssr',
      option: `ssr: () => { console.log('MARK_SERVER_SECRET'); return true }`,
    },
    { key: 'headers', option: `headers: () => ({ a: 'MARK_SERVER_SECRET' })` },
    { key: 'staticData', option: `staticData: { a: 1 }` },
  ])(
    'a second call holding `$key` fails the client build at that call',
    async ({ option }) => {
      const error: unknown = await build(
        bundler,
        `const extra = createFileRoute('/x')({ ${option} })
export const Route = createFileRoute('/x')({ component: () => <p>{String(!!extra)}</p> })
`,
      ).then(
        (result) =>
          expect.fail(
            `the build succeeded; the option's text is ${result.client.where('MARK_SERVER_SECRET')} in the client bundle`,
          ),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/routes/x.tsx',
        root: error.root,
        position: { line: 2 },
      })
    },
  )

  test("the error's fix, everything on the route bound to `Route`, builds without `server` in the client", async () => {
    const result = await build(
      bundler,
      `export const Route = createFileRoute('/x')({
  ${server},
  component: () => <p>MARK_PAGE</p>,
})
`,
    )
    expect(result.client.where('MARK_SERVER_SECRET')).toBe('nowhere')
    expect(result.client.where('MARK_PAGE')).not.toBe('nowhere')
  })
})
