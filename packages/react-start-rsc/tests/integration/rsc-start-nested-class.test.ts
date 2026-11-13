/**
 * A server fn nested in an exported class of a route file with a separate
 * provider (Vite's `rsc` environment, Rsbuild's RSC layer), where only the split
 * component reads the class: the class leaves the route module, its handler runs
 * in the provider and reads the class there. Nothing may read an uninitialised
 * binding while the modules load, on the server or in the browser.
 */
import { afterAll, beforeAll, describe, test } from 'vitest'
import {
  openRscPage,
  startRscPreviewServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'
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
  ...route(
    'method-fn',
    `export class K {
  ${label}
  make() {
    return createServerFn().handler(async () => K.label)
  }
}
`,
    'new K().make()',
  ),
  ...route(
    'chain-read',
    `export class K {
  ${label}
  make() {
    return createServerFn()
      .middleware(K ? [] : [])
      .handler(async () => K.label)
  }
}
`,
    'new K().make()',
  ),
  // nothing keeps these in the route module: they move to the split component
  // or to the class's extracted module, with the chain they hold
  ...route(
    'pure-class',
    `export class K {
  label() {
    return 'MARK_HANDLER'
  }
  make() {
    return createServerFn().handler(async () => new K().label())
  }
}
`,
    'new K().make()',
  ),
  ...route(
    'plain-function',
    `function make() {
  return createServerFn().handler(async () => 'MARK_HANDLER')
}
`,
    'make()',
  ),
  ...route(
    'in-component',
    '',
    `createServerFn().handler(async () => 'MARK_HANDLER')`,
  ),
  ...route(
    'in-object',
    `const fns = {
  make: () => createServerFn().handler(async () => 'MARK_HANDLER'),
}
`,
    'fns.make()',
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
  ...route(
    'two-classes',
    `export class Z {
  ${label}
  make() {
    return createServerFn().handler(async () => K.label)
  }
}
export class K extends Z {}
`,
    'new K().make()',
  ),
}

describe.each([
  ['vite', startRscPreviewServer],
  ['rsbuild', startRscRsbuildPreviewServer],
] as const)('a %s build', (_, start) => {
  let server: RscPreviewServer
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    server = await start({
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
      files,
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  test.each(Object.keys(files).map((f) => f.replace(/.*\/|\.tsx/g, '')))(
    '/%s renders and its server fn answers the browser',
    async (name) => {
      const opened = await openRscPage(server, `/${name}`)
      await opened.waitForText('MARK_PAGE', {
        selector: '[data-testid=label]',
      })
      await waitForHydration(opened)
      await opened.page.locator('[data-testid=call]').click()
      await opened.waitForText('called MARK_HANDLER', {
        selector: '[data-testid=called]',
      })
    },
  )
})
