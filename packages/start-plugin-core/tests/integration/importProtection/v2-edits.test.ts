/**
 * Edits move an import across the import-protection boundary in a running
 * dev server (SPEC J6.13, J6.4): each denied import is first
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
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, describe, expect, test } from 'vitest'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import {
  importersIn,
  recordedSince,
  runRsbuildSsr,
  settledAcrossTurn,
  ssrNodeOutput,
} from './v2-hosts'

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
  .server(() => Buffer.from('MARK_SERVER_BRANCH').toString())
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
      // `log: 'always'`: a violation is logged on each load, so a stale
      // violation shows in the logs of the step that removed it.
      const recorder = violationRecorder({ log: 'always' })
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: app,
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
      const recorded = { root: server.root, ...recorder }
      const outcomes: Array<StepOutcome> = []
      for (const [index, step] of steps.entries()) {
        let clientReports: Array<string> | undefined
        let serverSince = 0
        if (index > 0) {
          await server.edit({
            'src/secret.server.ts': null,
            'src/widget.client.ts': null,
          })
          await server.edit({
            'src/secret.server.ts': secretServer(index),
            'src/widget.client.ts': widgetClient(index),
          })
          // The recreated state, loaded in both environments before the
          // step's edit: the handling of the recreations (the SSR runner's
          // reload, the transforms it starts) ends here, by the loads'
          // completion, not by a timer, so the logs from `since` on are the
          // step's edit alone.
          await runViteClient(server, '/src/router.ts', 'return null')
          await server.import('/src/router.ts', 'ssr')
          await server.idle()
          // The logs of the step: from its edit on
          const clientSince = recorder.violations.length
          await server.edit({ 'src/client-side.ts': clientSide(step.live) })
          await server.load('/src/router.ts')
          await server.idle()
          clientReports = importersIn(
            recordedSince(recorded, clientSince),
            'client',
          )
          serverSince = recorder.violations.length
          await server.edit({ 'src/server-side.ts': serverSide(step.live) })
        }
        const client = await runViteClient(
          server,
          '/src/router.ts',
          observeScript,
        )
        const { result: serverValues } = await captureConsole(async () => {
          const ssr = (await server.import(
            '/src/router.ts',
            'ssr',
          )) as Parameters<typeof observe>[0]
          return observe(ssr, describeValue)
        })
        const result = {
          clientValues: client.result as Record<string, string>,
          serverValues,
        }
        const served = await server.load('/src/router.ts')
        await server.idle()
        const logs = recordedSince(recorded, serverSince)
        outcomes.push({
          client: {
            values: result.clientValues,
            reported: clientReports ?? importersIn(logs, 'client'),
          },
          server: {
            values: result.serverValues,
            reported: importersIn(logs, 'server'),
          },
          clientHasSecret: Object.values(served).some((code) =>
            code.includes('MARK_SECRET'),
          ),
        })
      }
      return outcomes
    },
    // The server importer's removal has its own settled window. The
    // original combined-write pin passes with this isolation and a real page;
    // retain the strict empty report set to detect future stale violations.
  )
})

describe('rsbuild dev', () => {
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  hostSuite(async () => {
    // `log: 'always'`: each compile reports what it finds, so a stale
    // violation shows in the compile of the step that removed it.
    const recorder = violationRecorder({ log: 'always', mockAccess: 'off' })
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      browser: true,
      hmr: false,
      config: ssrNodeOutput,
      files: app,
      start: { importProtection: recorder.importProtection },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
    const recorded = { root: server.root, ...recorder }
    const outcomes: Array<StepOutcome> = []
    for (const [index, step] of steps.entries()) {
      let clientReports: Array<string> | undefined
      let serverSince = 0
      if (index > 0) {
        // Each deletion and each recreation in its own edit, settled before
        // the next write: a removal (or a write) landing while Rspack
        // compiles the previous one can be lost (watchpack 2.5.2
        // vendored by Rspack, fixed in 2.6.0; KNOWN-BUGS.md, upstream
        // issues). Merge the deletions, then the recreations, back into one
        // edit each once Rspack bundles watchpack >= 2.6. (Settled first
        // too: a compile the start or the previous step still has pending
        // would pause the watcher while the first removal lands.)
        await settledAcrossTurn(server)
        await server.edit({ 'src/secret.server.ts': null })
        await settledAcrossTurn(server)
        await server.edit({ 'src/widget.client.ts': null })
        await settledAcrossTurn(server)
        await server.edit({ 'src/secret.server.ts': secretServer(index) })
        await settledAcrossTurn(server)
        await server.edit({ 'src/widget.client.ts': widgetClient(index) })
        await settledAcrossTurn(server)
        const clientSince = recorder.violations.length
        await server.edit({ 'src/client-side.ts': clientSide(step.live) })
        await settledAcrossTurn(server)
        clientReports = importersIn(
          recordedSince(recorded, clientSince),
          'client',
        )
        serverSince = recorder.violations.length
        await server.edit({ 'src/server-side.ts': serverSide(step.live) })
        await settledAcrossTurn(server)
      }
      const values = (ran: { result: unknown } | { error: string }) => {
        expect(ran).toEqual({ result: expect.anything() })
        return (ran as { result: Record<string, string> }).result
      }
      // Copy this settled state's window before executing code.
      const warnings = recordedSince(recorded, serverSince)
      outcomes.push({
        client: {
          values: values(await runInClient(server, observeScript)),
          reported: clientReports ?? importersIn(warnings, 'client'),
        },
        server: {
          values: values(await runRsbuildSsr(server, observeScript)),
          reported: importersIn(warnings, 'server'),
        },
        clientHasSecret: Object.values(await server.outputs('client')).some(
          (code) => code.includes('MARK_SECRET'),
        ),
      })
    }
    return outcomes
  })
})
