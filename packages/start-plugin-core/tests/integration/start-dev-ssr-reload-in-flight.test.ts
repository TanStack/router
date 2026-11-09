/**
 * A Start dev server serves requests that overlap an SSR reload: a request
 * whose server modules were still being evaluated when an edit reloaded the
 * SSR environment, and a request that arrived after the reload, both render
 * the page. (An IDE refactor or a `git stash` with a page open: the page's
 * server fn calls and document requests arrive while the burst's reloads
 * do.)
 *
 * Known bug, upstream (Vite's module runner, 8.3.4 to 8.3.7): a `full-reload`
 * clears the runner's evaluated modules while a request's import is still
 * evaluating. That import goes on with the modules it already holds and
 * takes the modules it imports later from the new generation, the ones a
 * request after the reload evaluates too. Both evaluate the route tree,
 * whose route modules they now partly share: each tree's `update()` sets
 * the shared routes' parents to its own, so the router one of them creates
 * has routes whose parent it never initialised (`undefined/c`: a 404 here,
 * `Duplicate routes found with id: undefined/$itemId` in a larger app).
 * Main's Start runs the same request path.
 */
import { describe, expect, test } from 'vitest'
import { startDevServer } from '../dev-server'

const timeout = 30_000

/**
 * What the app's modules and the test share (one process: the SSR
 * environment's module runner runs in the test's process):
 * `src/routes/l/b.tsx` waits for `open` at its top level and counts its
 * evaluations; the app's server entry counts the SSR reloads Vite announces
 * to it.
 */
interface Gate {
  open: Promise<void>
  release: () => void
  evaluations: number
  reloads: number
}
const gateKey = 'tanstack.start-harness.reload-gate'
const gateExpression = `(globalThis as any)[Symbol.for(${JSON.stringify(gateKey)})]`

const files = {
  'harness/server-entry.ts': `import handler from '@tanstack/react-start/server-entry'
import { tag } from './tag'
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    const gate = ${gateExpression}
    if (gate) gate.reloads++
  })
}
export default { fetch: (request: Request) => (void tag, handler.fetch(request)) }
`,
  'harness/tag.ts': `export const tag = 'v1'\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
`,
  'src/routes/l.tsx': `import { Outlet, createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/l')({ component: () => <main><Outlet /></main> })
`,
  'src/routes/l/b.tsx': `import { createFileRoute } from '@tanstack/react-router'
const gate = ${gateExpression}
if (gate) {
  gate.evaluations++
  await gate.open
}
export const Route = createFileRoute('/l/b')({ component: () => <p>MARK_B</p> })
`,
  'src/routes/l/c.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/l/c')({ component: () => <p>MARK_C</p> })
`,
}

/** Polls `done` until it holds or `ms` passed; whether it held. */
async function within(ms: number, done: () => boolean): Promise<boolean> {
  const deadline = Date.now() + ms
  while (!done()) {
    if (Date.now() > deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return true
}

/**
 * Two requests for `/l/c`: the first evaluates the route tree and waits in
 * the middle of it (`src/routes/l/b.tsx`); with `reload`, an edit of a
 * module only the server entry imports reloads the SSR environment before
 * the second is sent. Then both go on. Each must render the page.
 */
async function overlappingRequests({ reload }: { reload: boolean }) {
  let release!: () => void
  const gate: Gate = {
    open: new Promise<void>((resolve) => (release = resolve)),
    release: () => release(),
    evaluations: 0,
    reloads: 0,
  }
  const globals = globalThis as unknown as Record<symbol, Gate | undefined>
  globals[Symbol.for(gateKey)] = gate
  try {
    const server = await startDevServer({ listen: true, files })
    const first = server.fetch('/l/c')
    expect(await within(10_000, () => gate.evaluations > 0)).toBe(true)

    if (reload) {
      await server.edit({ 'harness/tag.ts': `export const tag = 'v2'\n` })
      expect(await within(10_000, () => gate.reloads > 0)).toBe(true)
    }

    const second = server.fetch('/l/c')
    if (reload) {
      // A runner that serves it from new module instances evaluates the
      // route tree again, up to the module the first request waits in
      // (bounded: a runner may also serve it from the first request's
      // modules)
      await within(2_000, () => gate.evaluations > 1)
    }
    gate.release()

    const pages = await Promise.all([first, second])
    expect(
      pages.map(({ status, body }) => ({
        status,
        rendered: body.includes('MARK_C'),
      })),
    ).toEqual([
      { status: 200, rendered: true },
      { status: 200, rendered: true },
    ])
  } finally {
    gate.release()
    delete globals[Symbol.for(gateKey)]
  }
}

describe('Vite dev: requests that overlap an SSR reload', () => {
  // Known bug (upstream, see the module comment): the request in flight
  // answers 404.
  test.fails(
    'the request in flight and a request after the reload both render the page',
    () => overlappingRequests({ reload: true }),
    timeout,
  )

  // The control: the same overlapping requests without a reload.
  test(
    'two overlapping requests both render the page',
    () => overlappingRequests({ reload: false }),
    timeout,
  )
})
