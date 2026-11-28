/**
 * With RSC the provider environment builds first and gives the server fns
 * their ids (SPEC J4.4), on Vite and on Rsbuild:
 * - an id a custom `generateFunctionId` returns that is not one URL path
 *   segment fails the production build there too, with an error naming the
 *   defining file;
 * - a custom id the browser calls reaches its handler, also a deprecated
 *   one (`:`, `'`), which builds with a warning naming the file.
 */
import { describe, expect } from 'vitest'
import {
  expectDiagnostic,
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { waitForHydration } from './rsc-app'
import { test } from './test'

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

/**
 * A route that shows the label `display`, calls `used` (custom id
 * `used-id`) and sends `used`'s own request to the URL of `display`, the
 * custom id of `unused`, a server fn no client code calls.
 */
const labelFiles = {
  'src/label-fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const used = createServerFn().handler(async () => 'MARK_USED')
export const unused = createServerFn().handler(async () => 'MARK_UNUSED')
`,
  'src/routes/label.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { used } from '../label-fns'
export const Route = createFileRoute('/label')({ component: Page })
function Page() {
  const [outcome, setOutcome] = useState('none')
  const call = async (id: string) => {
    try {
      const value = await used({
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(String(input).replace(/used-id$/, id), init),
      } as any)
      setOutcome(id + ' answered ' + String(value))
    } catch {
      setOutcome(id + ' refused')
    }
  }
  return (
    <main>
      <p data-testid="label">{'display'}</p>
      <p data-testid="outcome">{outcome}</p>
      <button data-testid="used" onClick={() => call('used-id')}>used</button>
      <button data-testid="display" onClick={() => call('display')}>display</button>
    </main>
  )
}
`,
}

const labelStart = {
  serverFns: {
    generateFunctionId: ({ functionName }: { functionName: string }) =>
      functionName.startsWith('used_')
        ? 'used-id'
        : functionName.startsWith('unused_')
          ? 'display'
          : undefined,
  },
}

describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
  test('an id that is not one URL path segment fails the build, naming the file', async ({
    serveRscBuild,
  }) => {
    const failure = await serveRscBuild({ bundler, files, start }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure, 'the build failed').toBeDefined()
    expectDiagnostic(failure, { severity: 'error', file: 'src/fns.ts' })
  }, 60_000)

  // SPEC J4.2 (R182) with a custom generator: the server fn whose stub
  // the client's emitted code holds answers the browser; `unused`, whose
  // custom id is also a label the page shows, is refused (c9701e2fc1: the
  // client build was scanned for the id's text, which admitted it)
  test('a custom id that is also a label of the page admits nothing: the unused server fn is refused', async ({
    openRscPage,
    serveRscBuild,
  }) => {
    const server = await serveRscBuild({
      bundler,
      files: labelFiles,
      start: labelStart,
    })
    const page = await openRscPage(server, '/label')
    await waitForHydration(page)
    expect(await page.locator('[data-testid=label]').textContent()).toBe(
      'display',
    )
    await page.locator('[data-testid=used]').click()
    await page
      .locator('[data-testid=outcome]', {
        hasText: 'used-id answered MARK_USED',
      })
      .waitFor()
    await page.locator('[data-testid=display]').click()
    await page
      .locator('[data-testid=outcome]', { hasText: 'display refused' })
      .waitFor()
    // (no report names the module: the server build provides what the
    // client calls)
    expectNoDiagnostic(server.messages, {
      file: 'src/label-fns.ts',
      root: server.root,
    })
  }, 60_000)

  test('custom ids the browser calls reach their handlers; a deprecated one warns', async ({
    openRscPage,
    serveRscBuild,
  }) => {
    const server = await serveRscBuild({
      bundler,
      files: calledFiles,
      start: calledStart,
    })
    const page = await openRscPage(server, '/calls')
    await waitForHydration(page)
    await page.locator('[data-testid=greet]').click()
    await page
      .locator('[data-testid=called]', { hasText: 'MARK_GREET' })
      .waitFor()
    await page.locator('[data-testid=quoted]').click()
    await page
      .locator('[data-testid=called]', { hasText: 'MARK_QUOTED' })
      .waitFor()
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
