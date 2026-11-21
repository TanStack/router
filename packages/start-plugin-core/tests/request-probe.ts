/**
 * The probe route of the harness apps: how a test runs server code inside a
 * real request of a Start app, so that Start's request context (the
 * request, the start options, the router, the global middleware's context)
 * is the one Start's own server entry opens, never one the harness builds.
 *
 * Every harness app that runs server code has a real router over the
 * generated route tree (`routerFile`) and a server route, the probe
 * (`probeRouteFile`, at `probeRoutePath`). A test registers a callback
 * under a token on a process-wide global, then sends a request for the
 * probe to the app's server entry (Start's `fetch`, the default export of
 * the server bundle a host imports, or the dev server's server entry): the
 * route's `GET` handler runs the callback while Start serves the request,
 * and the test gets what the callback returned or threw
 * (`inProbeRequest`).
 *
 * Used by the build harness (`build-harness.ts`, in the child process that
 * runs the server bundle), the dev-server harness (`dev-server.ts`) and the
 * public Start host (`start-host.ts`).
 */

/** The path of the probe route of a harness app. */
export const probeRoutePath = '/harness-probe'

/** The probe route's file (the router generator's routes directory). */
export const probeRouteFile = 'src/routes/harness-probe.ts'

/**
 * The global (`Symbol.for`) the probe route reads the callbacks from: a
 * `Map` from token to callback, shared by every copy of the harness in a
 * process.
 */
const probesKey = 'tanstack.start-harness.probes'

/**
 * Source of the probe route for an app of the router package `router`
 * (e.g. `@tanstack/react-router`). The route's `GET` handler runs the
 * callback the request's `run` parameter names, with `context` (an
 * expression of the route module, e.g. what a production host gives its
 * callbacks), after `prelude` (statements at the top of the module).
 */
export function probeRoute(
  router: string,
  options: { prelude?: string; context?: string } = {},
): string {
  return `import { createFileRoute } from '${router}'
${options.prelude ?? ''}type Probe = (context?: unknown) => Promise<void>
export const Route = createFileRoute('${probeRoutePath}')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const run = new URL(request.url).searchParams.get('run') ?? ''
        const probes = (globalThis as unknown as Record<symbol, Map<string, Probe> | undefined>)[
          Symbol.for(${JSON.stringify(probesKey)})
        ]
        const probe = probes?.get(run)
        if (!probe) {
          return new Response('no probe ' + run, { status: 404 })
        }
        await probe(${options.context ?? ''})
        return new Response('ok')
      },
    },
  },
})
`
}

/**
 * `src/router.ts` of a harness app of the router package `router`: the real
 * router over the route tree the router generator writes.
 */
export const routerFile = (router: string) =>
  `import { createRouter } from '${router}'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`

/** `src/routes/__root.tsx` of a harness app: a root route of its own. */
export const rootRouteFile = (router: string) =>
  `import { createRootRoute } from '${router}'
export const Route = createRootRoute()
`

/**
 * The app files a harness app needs to run server code in a request: the
 * router, a root route and the probe route (an app's own files of the same
 * paths win).
 */
export const requestFiles = (router: string): Record<string, string> => ({
  'src/router.ts': routerFile(router),
  'src/routes/__root.tsx': rootRouteFile(router),
  [probeRouteFile]: probeRoute(router),
})

/**
 * Runs `run` inside a request for the probe route that `send` sends to the
 * app's server entry (`send(path)`, `path` relative to the app's origin),
 * and gives what `run` returned, or throws what it threw. Fails when the
 * request did not run it (the app has no probe route, or the request failed
 * before the route), with the response. Self-contained: the build harness
 * runs its source in the child process of a server bundle.
 */
export async function inProbeRequest<T>(
  send: (path: string) => Promise<Response>,
  run: (context?: any) => T | Promise<T>,
): Promise<T> {
  const probes = ((globalThis as Record<symbol, unknown>)[
    Symbol.for('tanstack.start-harness.probes')
  ] ??= new Map()) as Map<string, (context?: unknown) => Promise<void>>
  const token = Math.random().toString(36).slice(2)
  let outcome: { value: T } | { error: unknown } | undefined
  probes.set(token, async (context) => {
    try {
      outcome = { value: await run(context) }
    } catch (error) {
      outcome = { error }
    }
  })
  try {
    const response = await send(`/harness-probe?run=${token}`)
    const body = await response.text()
    if (!outcome) {
      throw new Error(
        `the probe request did not run (${response.status}): ${body}`,
      )
    }
  } finally {
    probes.delete(token)
  }
  if ('error' in outcome) {
    throw outcome.error
  }
  return outcome.value
}
