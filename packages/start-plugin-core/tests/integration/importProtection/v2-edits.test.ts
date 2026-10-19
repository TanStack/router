/**
 * Edits move an import across the import-protection boundary in a running
 * dev server (FIX-PLAN V2-14; SPEC J6.13, J6.4): each denied import is first
 * used only where the compiler removes it for the environment (allowed),
 * then also live (denied), then only removed again (allowed), and its
 * target is deleted and recreated between the steps. After each step: the
 * reports of that step (no stale report, no missed one), what each importer
 * gets (real module or safe mock) in each environment, and no secret in the
 * client's code.
 * - `src/client-side.ts` uses the server-only `src/secret.server.ts` in
 *   `createIsomorphicFn().server()` (the client never runs it), then also
 *   in `liveSecret`;
 * - `src/server-side.ts` uses the client-only `src/widget.client.ts` in
 *   `.client()` (the server never runs it), then also in `liveWidget`.
 * Vite and Rsbuild dev servers with Start's whole plugin; the same edits
 * seen by a browser page are in v2-edits-page.test.ts.
 */
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, describe, expect, test } from 'vitest'
import { servedStartRuntime, startDevServer } from '../../dev-server'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import {
  runInClient,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { reportedImporters, runRsbuildSsr } from './v2-hosts'

const timeout = 60_000
const compileTimeout = timeout

/** The targets; `version` marks a recreated file (same behaviour, new text). */
const secretServer = (version = 0) =>
  `// version ${version}\nexport const secret = () => 'MARK_SECRET'\n`
const widgetClient = (version = 0) =>
  `// version ${version}\nexport const widget = () => 'MARK_WIDGET'\n`

/** `src/client-side.ts`; `live`: also uses the denied import live. */
const clientSide = (
  live: boolean,
) => `import { createIsomorphicFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const readSecret = createIsomorphicFn()
  .server(() => secret())
  .client(() => 'MARK_CLIENT_BRANCH')
${live ? `export const liveSecret = () => secret()\n` : ''}`

/** `src/server-side.ts`; `live`: also uses the denied import live. */
const serverSide = (
  live: boolean,
) => `import { createIsomorphicFn } from '@tanstack/react-start'
import { widget } from './widget.client'
export const readWidget = createIsomorphicFn()
  .client(() => widget())
  .server(() => 'MARK_SERVER_BRANCH')
${live ? `export const liveWidget = () => widget()\n` : ''}`

const app = {
  'src/secret.server.ts': secretServer(),
  'src/widget.client.ts': widgetClient(),
  'src/client-side.ts': clientSide(false),
  'src/server-side.ts': serverSide(false),
  'src/entry.ts': `import * as clientSide from './client-side'
import * as serverSide from './server-side'
export { clientSide, serverSide }
;(globalThis as any).app = { clientSide, serverSide }
`,
  // Start's router entry reaches the app's modules, as a router reaches its
  // routes.
  'src/router.ts': `export * from './entry'
export const getRouter = () => undefined
`,
}

/** The edits of each step after the first, each after deleting and recreating the targets. */
const steps = [
  { name: 'allowed', live: false },
  { name: 'denied', live: true },
  { name: 'allowed again', live: false },
] as const

const stepEdits = (live: boolean) => ({
  'src/client-side.ts': clientSide(live),
  'src/server-side.ts': serverSide(live),
})

/**
 * What each export of the app returns in one environment, described (`a
 * safe mock`, the value's text, or `absent`). Self-contained, for the
 * scripts of an Rsbuild run too (`observePrelude`).
 */
function observe(
  app: Record<string, Record<string, (() => unknown) | undefined>>,
  describe: (value: unknown, secret?: string) => string,
): Record<string, string> {
  const call = (fn: (() => unknown) | undefined) => {
    if (fn === undefined) {
      return 'absent'
    }
    try {
      return describe(fn(), 'MARK_')
    } catch (error) {
      return `throws: ${String(error)}`
    }
  }
  return {
    readSecret: call(app.clientSide!.readSecret),
    liveSecret: call(app.clientSide!.liveSecret),
    readWidget: call(app.serverSide!.readWidget),
    liveWidget: call(app.serverSide!.liveWidget),
  }
}

const observeScript = `${describeValuePrelude}
return (${observe.toString()})(globalThis.app, describeValue)`

/** What one step shows in one environment. */
interface Seen {
  values: Record<string, string>
  /** The importers reported for this environment during the step. */
  reported: Array<string>
}

interface StepOutcome {
  client: Seen
  server: Seen
  /** Whether the client's code contains the server-only value. */
  clientHasSecret: boolean
}

/** What each step should show. */
const expected = (live: boolean): Omit<StepOutcome, 'clientHasSecret'> => ({
  client: {
    values: {
      readSecret: 'MARK_CLIENT_BRANCH',
      liveSecret: live ? 'a safe mock' : 'absent',
      readWidget: 'MARK_WIDGET',
      liveWidget: live ? 'MARK_WIDGET' : 'absent',
    },
    reported: live ? ['src/client-side.ts'] : [],
  },
  server: {
    values: {
      readSecret: 'MARK_SECRET',
      liveSecret: live ? 'MARK_SECRET' : 'absent',
      readWidget: 'MARK_SERVER_BRANCH',
      liveWidget: live ? 'a safe mock' : 'absent',
    },
    reported: live ? ['src/server-side.ts'] : [],
  },
})

/**
 * The tests of a host: `run()` runs every step once (shared by the tests)
 * and gives what each step showed.
 */
function hostSuite(
  run: () => Promise<Array<StepOutcome>>,
  /** The steps whose report test main fails (`.fails`). */
  pinnedReports: Array<number> = [],
) {
  let outcomes: Promise<Array<StepOutcome>> | undefined
  const outcome = async (step: number) => (await (outcomes ??= run()))[step]!

  describe.each(steps.map((step, index) => ({ ...step, index })))(
    'step $index, $name',
    ({ index, live }) => {
      test(
        'each environment gets the real module or a safe mock, per importer',
        async () => {
          const { client, server } = await outcome(index)
          expect({ client: client.values, server: server.values }).toEqual({
            client: expected(live).client.values,
            server: expected(live).server.values,
          })
        },
        timeout,
      )

      test(
        "the client's code has no secret",
        async () => {
          expect((await outcome(index)).clientHasSecret).toBe(false)
        },
        timeout,
      )
      ;(pinnedReports.includes(index) ? test.fails : test)(
        'the step reports its violations, and only those',
        async () => {
          const { client, server } = await outcome(index)
          expect({
            client: client.reported,
            server: server.reported,
          }).toEqual({
            client: expected(live).client.reported,
            server: expected(live).server.reported,
          })
        },
        timeout,
      )
    },
  )
}

describe('vite dev', () => {
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  hostSuite(
    async () => {
      const server = await startDevServer({
        // `log: 'always'`: a violation is logged on each load, so a stale
        // violation shows in the logs of the step that removed it.
        start: { importProtection: { log: 'always' } },
        files: app,
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
      const outcomes: Array<StepOutcome> = []
      for (const [index, step] of steps.entries()) {
        let since = 0
        if (index > 0) {
          await server.edit({
            'src/secret.server.ts': null,
            'src/widget.client.ts': null,
          })
          await server.edit({
            'src/secret.server.ts': secretServer(index),
            'src/widget.client.ts': widgetClient(index),
          })
          await server.idle()
          // The logs of the step: from its edit on
          since = server.logs.length
          await server.edit(stepEdits(step.live))
        }
        const { result } = await captureConsole(async () => {
          const client = (await evaluateServed(server, '/src/router.ts', {
            stubs: servedStartRuntime,
          })) as Parameters<typeof observe>[0]
          const clientValues = observe(client, describeValue)
          const ssr = (await server.import(
            '/src/router.ts',
            'ssr',
          )) as Parameters<typeof observe>[0]
          return { clientValues, serverValues: observe(ssr, describeValue) }
        })
        const served = await server.load('/src/router.ts')
        await server.idle()
        const logs = server.logs.slice(since)
        outcomes.push({
          client: {
            values: result.clientValues,
            reported: reportedImporters(logs, 'client'),
          },
          server: {
            values: result.serverValues,
            reported: reportedImporters(logs, 'server'),
          },
          clientHasSecret: Object.values(served).some((code) =>
            code.includes('MARK_SECRET'),
          ),
        })
      }
      return outcomes
    },
    // Bug: with `log: 'always'`, the edit that removes the live use of the
    // `.client` file from `src/server-side.ts` (step 2) logs the server
    // violation of that use again while the dev server handles the edit,
    // before any request, built from the previous version of the file (its
    // code frame shows the removed line `export const liveWidget = () =>
    // widget()`). With the default `log: 'once'` the dedupe hides it. The
    // client twin (step 2 of `src/client-side.ts`) logs nothing.
    // Impact: after a fix, the dev server reports the violation the fix
    // removed, as if it were still there (SPEC J6.13: no stale report).
    // Source: FIX-PLAN V2-14.
    [2],
  )
})

describe('rsbuild dev', () => {
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  hostSuite(async () => {
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      files: app,
      // `log: 'always'`: each compile reports what it finds, so a stale
      // violation shows in the compile of the step that removed it.
      start: { importProtection: { log: 'always', mockAccess: 'off' } },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
    const outcomes: Array<StepOutcome> = []
    for (const [index, step] of steps.entries()) {
      // The reports of the step: from its edit on
      let since = 0
      if (index > 0) {
        // Known upstream flake (FOLLOWUPS "Rspack loses a file removal
        // that lands while a compile runs"): a removal that lands while
        // the watcher is paused for a compile is never reported, and the
        // first removal starts a compile at once. Not worked around here.
        await server.edit({
          'src/secret.server.ts': null,
          'src/widget.client.ts': null,
        })
        since = server.diagnostics.length
        // Recreated with the step's edit (W3-ip-v2): recreated on their
        // own, under load the second file was never compiled (very likely
        // the same mechanism: a change landing while the watcher is paused,
        // with an mtime before the compile's start); the edited importers
        // resolve them again.
        await server.edit({
          'src/secret.server.ts': secretServer(index),
          'src/widget.client.ts': widgetClient(index),
          ...stepEdits(step.live),
        })
      }
      const values = (ran: { result: unknown } | { error: string }) => {
        expect(ran).toEqual({ result: expect.anything() })
        return (ran as { result: Record<string, string> }).result
      }
      // The warnings of the compiles of the step's edit
      const warnings = findDiagnostics(server.diagnostics.slice(since), {
        severity: 'warning',
      })
      outcomes.push({
        client: {
          values: values(await runInClient(server, observeScript)),
          reported: reportedImporters(warnings, 'client'),
        },
        server: {
          values: values(await runRsbuildSsr(server, observeScript)),
          reported: reportedImporters(warnings, 'server'),
        },
        clientHasSecret: Object.values(await server.outputs('client')).some(
          (code) => code.includes('MARK_SECRET'),
        ),
      })
    }
    return outcomes
  })
})
