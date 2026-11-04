/**
 * With RSC the provider environment builds first and gives the server fns
 * their ids (SPEC J4.4): an id a custom `generateFunctionId` returns that is
 * not one URL path segment fails the production build there too, with an
 * error naming the defining file, on Vite and on Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRscPreviewServer, startRscRsbuildPreviewServer } from './rsc-app'

const files = {
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_HANDLER')
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
  component: () => <button onClick={() => greet()}>call</button>,
})
`,
}

const start = {
  serverFns: {
    generateFunctionId: ({ filename }: { filename: string }) =>
      filename.endsWith('src/fns.ts') ? 'fns/greet' : undefined,
  },
}

describe.each([
  ['vite', startRscPreviewServer],
  ['rsbuild', startRscRsbuildPreviewServer],
] as const)('%s', (_bundler, startServer) => {
  test('an id that is not one URL path segment fails the build, naming the file', async () => {
    const failure = await startServer({ files, start }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure, 'the build failed').toBeDefined()
    expectDiagnostic(failure, { severity: 'error', file: 'src/fns.ts' })
  }, 60_000)
})
