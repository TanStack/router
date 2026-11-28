/**
 * A server fn created at module load but not as a top-level declarator's value
 * (a static field of an exported class only the split component reads, a call's
 * argument) in a route file with a separate provider (Vite's `rsc` environment,
 * Rsbuild's RSC layer): the hoisted chain's handler runs in the provider and
 * reads the class or the declaration there. Nothing may read an uninitialised
 * binding while the modules load, on the server or in the browser.
 */
import { describe } from 'vitest'
import { serveRscBuild, waitForHydration } from './rsc-app'
import { test } from './test'
import type { RscPreviewServer } from './rsc-app'

const page = (fn: string) => `export const Route = createFileRoute(ROUTE)({
  component: Page,
})
function Page() {
  const [called, setCalled] = useState('')
  const fn = ${fn}
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button
        data-testid="call"
        onClick={() =>
          fn().then(setCalled, (e: Error) => setCalled(String(e?.message)))
        }
      >
        call
      </button>
    </main>
  )
}
`
const head = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
`
const route = (name: string, source: string, fn: string) => ({
  [`src/routes/${name}.tsx`]: `${head}${source}${page(fn).replace('ROUTE', `'/${name}'`)}`,
})
const label = `static label = ['MARK', 'HANDLER'].join('_')`

const files = {
  ...route(
    'static-fn',
    `export class K {
  ${label}
  static fn = createServerFn().handler(async () => K.label)
}
`,
    'K.fn',
  ),
  // R3-G7-3: a chain nested in the statement right after the declaration
  // it reads outside its handler (hoisted before that statement)
  ...route(
    'after-declaration',
    `import { createMiddleware } from '@tanstack/react-start'
const registry = {
  fns: [] as Array<() => Promise<string>>,
  add(fn: () => Promise<string>) {
    registry.fns.push(fn)
  },
}
const auth = createMiddleware({ type: 'function' }).server(({ next }) => next())
registry.add(createServerFn().middleware([auth]).handler(async () => 'MARK_HANDLER'))
`,
    'registry.fns[0]!',
  ),
}

describe.each(['vite', 'rsbuild'] as const)('a %s build', (bundler) => {
  let server: RscPreviewServer

  test.aroundAll(async (runSuite, { fileRoot }) => {
    server = await serveRscBuild(fileRoot, {
      bundler,
      files,
    })
    try {
      await runSuite()
    } finally {
      await server.close()
    }
  })

  test.for(Object.keys(files).map((f) => f.replace(/.*\/|\.tsx/g, '')))(
    '/%s renders and its server fn answers the browser',
    async (name, { openRscPage }) => {
      const opened = await openRscPage(server, `/${name}`)
      await opened
        .locator('[data-testid=label]', { hasText: /MARK_PAGE/ })
        .waitFor()
      await waitForHydration(opened)
      await opened.locator('[data-testid=call]').click()
      await opened
        .locator('[data-testid=called]', { hasText: /called MARK_HANDLER/ })
        .waitFor()
    },
  )
})
