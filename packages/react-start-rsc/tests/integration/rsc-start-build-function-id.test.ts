/**
 * With RSC the provider environment builds first and gives the server fns
 * their ids (SPEC J4.4), on Vite and on Rsbuild:
 * - an id a custom `generateFunctionId` returns that is not one URL path
 *   segment fails the production build there too, with an error naming the
 *   defining file;
 * - a custom id the browser calls reaches its handler, also a deprecated
 *   one (`:`, `'`), which builds with a warning naming the file.
 */
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  openRscPage,
  startRscPreviewServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

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

/** Two server fns of their own files, each called by a button of the page. */
const calledFiles = {
  'src/greet.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREET')
`,
  'src/quoted.ts': `import { createServerFn } from '@tanstack/react-start'
export const quoted = createServerFn().handler(async () => 'MARK_QUOTED')
`,
  'src/routes/calls.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { greet } from '../greet'
import { quoted } from '../quoted'
export const Route = createFileRoute('/calls')({
  component: Page,
})
function Page() {
  const callGreet = useServerFn(greet)
  const callQuoted = useServerFn(quoted)
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="called">called {called}</p>
      <button data-testid="greet" onClick={() => callGreet().then((v) => setCalled((c) => c + ' ' + v))}>greet</button>
      <button data-testid="quoted" onClick={() => callQuoted().then((v) => setCalled((c) => c + ' ' + v))}>quoted</button>
    </main>
  )
}
`,
}

const calledStart = {
  serverFns: {
    generateFunctionId: ({ filename }: { filename: string }) =>
      filename.endsWith('src/greet.ts')
        ? 'greet-id'
        : filename.endsWith('src/quoted.ts')
          ? "quoted:it's"
          : undefined,
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

  test('custom ids the browser calls reach their handlers; a deprecated one warns', async () => {
    const server = await startServer({ files: calledFiles, start: calledStart })
    const page = await openRscPage(server, '/calls')
    await waitForHydration(page)
    await page.page.locator('[data-testid=greet]').click()
    await page.waitForText('MARK_GREET', { selector: '[data-testid=called]' })
    await page.page.locator('[data-testid=quoted]').click()
    await page.waitForText('MARK_QUOTED', { selector: '[data-testid=called]' })
    // (the build succeeded: a report naming the file is a warning)
    expect(
      findDiagnostics(server.messages, {
        file: 'src/quoted.ts',
        root: server.root,
      }).length > 0,
      `a warning naming src/quoted.ts in:\n${server.messages.join('\n')}`,
    ).toBe(true)
  }, 60_000)
})
