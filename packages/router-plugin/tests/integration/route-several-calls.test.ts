/**
 * Two calls of a route file's route constructor (SPEC J2.11, R172): not
 * supported, so the build fails at the call not bound to `Route`, whatever
 * its options hold, on each bundler running the code splitter; also when
 * the route file calls it through the router package's namespace
 * (`Router.createFileRoute`, Astra R9).
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { build, routeApp, routeHead } from '../build-harness'

const timeout = 60_000

const other = `createFileRoute('/' as any)({ component: () => <p>other</p> })`
const route = `export const Route = createFileRoute('/')({ component: () => <p>page</p> })`
const namespaceHead = `import * as Router from '@tanstack/react-router'\n`

describe.each(['vite', 'webpack', 'rspack'] as const)('%s', (bundler) => {
  test.each([
    {
      name: 'before',
      head: routeHead(),
      call: other,
      body: `const Other = ${other}\n${route}\n;(globalThis as any).other = Other\n`,
    },
    {
      name: 'after',
      head: routeHead(),
      call: other,
      body: `${route}\nexport const Other = ${other}\n`,
    },
    {
      name: 'after, through the namespace,',
      head: namespaceHead,
      call: `Router.${other}`,
      body: `export const Route = Router.${route.slice('export const Route = '.length)}\nexport const Other = Router.${other}\n`,
    },
  ])(
    'a second call $name the route fails the build at that call',
    async ({ head, call, body }) => {
      const source = `${head}${body}`
      const failure = await build({
        bundler,
        env: 'client',
        files: routeApp(source, { env: 'client' }),
      }).then(
        () => expect.fail('the build succeeded'),
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(BuildError)
      const reported = expectDiagnostic(diagnosticsOf(failure), {
        severity: 'error',
        file: 'routes/index.tsx',
        position: diagnosticPosition(source, call),
      })
      expect(reported.text).toContain('not supported')
      expect(reported.text).toContain('bound to its `Route` export')
    },
    timeout,
  )
})
