/**
 * Policy branches of import protection on dev servers with Start's whole
 * plugin (FIX-PLAN V2-18; SPEC J6.6, J6.7, J6.9): per importer of the same
 * denied file, an importer `ignoreImporters` exempts and one `onViolation`
 * allows (returning `false`, or `Promise<false>`) get the real module and
 * are not reported (user ruling 2026-10-17 on exemptions; J6.6 "real module,
 * no mock, no report"); any other importer gets a safe mock and is reported.
 * Every entry counts: the app's own client entry `src/client.ts` and server
 * entry `src/server.ts`. Rsbuild dev, and the `Promise<false>` row on Vite
 * dev (its sync twin is pinned in dev.test.ts).
 */
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { startDevServer } from '../../dev-server'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import {
  runInClient,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { reportedImporters, rsbuildDevLog, runRsbuildSsr } from './v2-hosts'
import type { ImportProtectionOptions } from '../../../src/schema'
import type { ViolationInfo } from '../../../src/import-protection/trace'

const timeout = 60_000
const compileTimeout = timeout

/** A module using `name` of the denied file `target` (a default export). */
const use = (target: string, name: string) =>
  `import { ${name} } from '${target}'\nexport default () => ${name}()\n`

/**
 * Importers of the denied file `src/secret.server.ts`, each in a module of
 * its own, which the app's client entry gives to the page
 * (`globalThis.uses`); the app's server entry answers with what
 * `src/app/handler.ts` gets from the denied file `src/widget.client.ts`.
 */
const app = {
  'src/secret.server.ts': `;((globalThis as any).loaded ??= []).push('secret')
export const secret = () => 'MARK_SECRET'
`,
  'src/widget.client.ts': `;((globalThis as any).loaded ??= []).push('widget')
export const widget = () => 'MARK_WIDGET'
`,
  'src/exempt/a.ts': use('../secret.server', 'secret'),
  'src/app/plain.ts': use('../secret.server', 'secret'),
  'src/app/allowed-sync.ts': use('../secret.server', 'secret'),
  'src/app/allowed-async.ts': use('../secret.server', 'secret'),
  'src/app/handler.ts': use('../widget.client', 'widget'),
  'src/client.ts': `import exempt from './exempt/a'
import plain from './app/plain'
import allowedSync from './app/allowed-sync'
import allowedAsync from './app/allowed-async'
;(globalThis as any).uses = { exempt, plain, allowedSync, allowedAsync }
`,
  'src/server.ts': `import handler from './app/handler'
;(globalThis as any).uses = { handler }
export default { fetch: () => new Response(String(handler())) }
`,
}

/** Whether a violation's importer is the app file `file`. */
const importerIs = (info: unknown, file: string) =>
  (info as ViolationInfo).importer.split('?')[0]!.endsWith(`/${file}`)

const importProtection: ImportProtectionOptions = {
  mockAccess: 'off',
  ignoreImporters: ['**/exempt/**'],
  onViolation: (info) => {
    if (importerIs(info, 'src/app/allowed-sync.ts')) {
      return false
    }
    if (importerIs(info, 'src/app/allowed-async.ts')) {
      return Promise.resolve(false)
    }
    return undefined
  },
}

/** A script (`describeValuePrelude`): what each use returns, described. */
const readScript = `${describeValuePrelude}
const values = {}
for (const [name, use] of Object.entries(globalThis.uses)) {
  try {
    values[name] = describeValue(use(), 'MARK_')
  } catch (error) {
    values[name] = 'throws: ' + String(error)
  }
}
return values`

const mocked = { value: 'a safe mock', reported: true }

describe('rsbuild dev', () => {
  // One dev server for every row.
  let started: ReturnType<typeof startRsbuildStartDevServer> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())
  const start = () =>
    (started ??= startRsbuildStartDevServer({
      compileTimeout,
      files: app,
      start: { importProtection: { ...importProtection, ...rsbuildDevLog } },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    }))

  /** What a use of the client returns, and whether its importer is reported. */
  async function client(name: string, importer: string) {
    const server = await start()
    const ran = await runInClient(server, readScript)
    expect(ran).toEqual({ result: expect.anything() })
    return {
      value: (ran as { result: Record<string, string> }).result[name],
      reported: reportedImporters(server.warnings, 'client').includes(importer),
    }
  }

  test(
    "an importer neither exempt nor allowed, reached from the app's client entry, gets a safe mock and is reported",
    async () => {
      expect(await client('plain', 'src/app/plain.ts')).toEqual(mocked)
    },
    timeout,
  )

  /** The importers exempted or allowed, by how. */
  const permitted = [
    { how: 'ignoreImporters exempts', name: 'exempt', file: 'src/exempt/a.ts' },
    {
      how: 'onViolation returns false for',
      name: 'allowedSync',
      file: 'src/app/allowed-sync.ts',
    },
    {
      how: 'onViolation returns Promise<false> for',
      name: 'allowedAsync',
      file: 'src/app/allowed-async.ts',
    },
  ]

  // Control for the pins below (same server).
  test.each(permitted)(
    'an importer $how is not reported',
    async ({ name, file }) => {
      expect((await client(name, file)).reported).toBe(false)
    },
    timeout,
  )

  // Bug: Rsbuild dev replaces a denied file with its mock in the file's own
  // transform, for every importer (rsbuild/import-protection-loader.ts:
  // `checkFileDenial` matches, then `generateDevSelfDenialModule`), before an
  // importer's exemption or the verdict of `onViolation` (`reportViolation`,
  // rsbuild/import-protection.ts, at the end of the compile) counts.
  // Exempting or allowing an importer only silences its report (the control
  // above). The Rsbuild dev twin of the Vite dev and build pins
  // (exemptions.test.ts; dev.test.ts and build.test.ts "onViolation returning
  // false").
  // Impact: code a project exempts on purpose, or an import it allows with
  // `onViolation` (documented: "Return false (or Promise<false>) to allow
  // this specific import"), silently gets a mock whose calls return mocks.
  // Source: FIX-PLAN V2-18.
  test.fails.each(permitted)(
    'an importer $how gets the real module',
    async ({ name, file }) => {
      expect((await client(name, file)).value).toBe('MARK_SECRET')
    },
    timeout,
  )

  test(
    "an import of a .client file reached from the app's server entry is mocked on the server and reported",
    async () => {
      const server = await start()
      const ran = await runRsbuildSsr(server, readScript)
      expect({
        ran,
        reported: reportedImporters(server.warnings, 'server'),
      }).toEqual({
        ran: { result: { handler: 'a safe mock' } },
        reported: ['src/app/handler.ts'],
      })
    },
    timeout,
  )
})

describe('vite dev: onViolation returning Promise<false>', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).loaded
    delete (globalThis as Record<string, unknown>).uses
  })

  /**
   * `src/app/allowed-async.ts` uses the denied file; Start's router entry
   * reaches it (as a router reaches its routes), and `onViolation` allows it
   * with `Promise<false>`.
   */
  const viteApp = {
    'src/secret.server.ts': app['src/secret.server.ts'],
    'src/app/allowed-async.ts': app['src/app/allowed-async.ts'],
    'src/router.ts': `import allowedAsync from './app/allowed-async'
;(globalThis as any).uses = { allowedAsync }
export const getRouter = () => undefined
`,
  }

  let started: ReturnType<typeof startDevServer> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  /** What the client gets, and the importers reported for the client. */
  async function outcome() {
    const server = await (started ??= startDevServer({
      start: { importProtection },
      files: viteApp,
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    }))
    const { result: value } = await captureConsole(async () => {
      await evaluateServed(server, '/src/router.ts')
      const { uses } = globalThis as unknown as {
        uses: Record<string, () => unknown>
      }
      return describeValue(uses.allowedAsync!(), 'MARK_')
    })
    await server.idle()
    return { value, reported: reportedImporters(server.logs, 'client') }
  }

  // Control for the pin below (same server).
  test(
    'the import is not reported',
    async () => {
      expect((await outcome()).reported).toEqual([])
    },
    timeout,
  )

  // Bug: the `Promise<false>` twin of the pin "returning false allows the
  // import: the client gets the real module" (dev.test.ts): dev import
  // protection replaces the denied file with its mock when it resolves the
  // import, before `onViolation` decides; returning `Promise<false>` only
  // silences the report (the control above).
  // Impact: an import allowed by an async `onViolation` (the form the docs
  // show) is a mock in the browser, without any warning.
  // Source: FIX-PLAN V2-18.
  test.fails(
    'the client gets the real module',
    async () => {
      expect((await outcome()).value).toBe('MARK_SECRET')
    },
    timeout,
  )
})
