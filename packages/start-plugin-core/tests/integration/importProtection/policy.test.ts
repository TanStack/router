/**
 * Policy branches of import protection on dev servers with Start's whole
 * plugin (SPEC J6.6, J6.7, J6.9): per importer of the same
 * denied file, an importer `ignoreImporters` exempts and one `onViolation`
 * allows (returning `false`, or `Promise<false>`) get the real module and
 * are not reported (SPEC J6.7; J6.6 "real module,
 * no mock, no report"); any other importer gets a safe mock and is reported.
 * Every entry counts: the app's own client entry `src/client.ts` and server
 * entry `src/server.ts`. Rsbuild dev, and the `Promise<false>` row on Vite
 * dev (its sync twin is pinned in dev.test.ts).
 */
import { describe, expect, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServerShared as startDevServerShared,
  startBrowserRsbuildStartDevServerShared as startRsbuildStartDevServerShared,
} from './client-pages'
import { importersIn, runRsbuildSsr, ssrNodeOutput } from './hosts'
import type {
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

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
const importerIs = (info: { importer: string }, file: string) =>
  info.importer.split('?')[0]!.endsWith(`/${file}`)

const importProtection: ImportProtectionOptions = {
  mockAccess: 'off',
  ignoreImporters: ['**/exempt/**'],
  allowImport: (info) => {
    if (importerIs(info, 'src/app/allowed-sync.ts')) {
      return true
    }
    if (importerIs(info, 'src/app/allowed-async.ts')) {
      return Promise.resolve(true)
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
  const openStarted = closeAfterAll()
  const recorder = violationRecorder(importProtection)
  const start = () =>
    (started ??= openStarted(() =>
      startRsbuildStartDevServerShared({
        compileTimeout,
        browser: true,
        hmr: false,
        config: ssrNodeOutput,
        files: app,
        start: { importProtection: recorder.importProtection },
      }),
    ))

  /** What a use of the client returns, and whether its importer is reported. */
  async function client(name: string, importer: string) {
    const server = await start()
    const ran = await runInClient(server, readScript)
    expect(ran).toEqual({ result: expect.anything() })
    return {
      value: (ran as { result: Record<string, string> }).result[name],
      reported: importersIn(
        { root: server.root, violations: recorder.violations },
        'client',
      ).includes(importer),
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
      how: 'allowImport returns true for',
      name: 'allowedSync',
      file: 'src/app/allowed-sync.ts',
    },
    {
      how: 'allowImport returns Promise<true> for',
      name: 'allowedAsync',
      file: 'src/app/allowed-async.ts',
    },
  ]

  // Code a project exempts on purpose, or an import it allows with
  // `allowImport`, gets the real module, silently. The Rsbuild dev twin of
  // the Vite dev and build tests (exemptions.test.ts; dev.test.ts and
  // build-markers.test.ts "allowImport returning true").
  test.each(permitted)(
    'an importer $how gets the real module and is not reported',
    async ({ name, file }) => {
      expect(await client(name, file)).toEqual({
        value: 'MARK_SECRET',
        reported: false,
      })
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
        reported: importersIn(
          { root: server.root, violations: recorder.violations },
          'server',
        ),
      }).toEqual({
        ran: { result: { handler: 'a safe mock' } },
        reported: ['src/app/handler.ts'],
      })
    },
    timeout,
  )
})

describe('vite dev: allowImport returning Promise<true>', () => {
  /**
   * `src/app/allowed-async.ts` uses the denied file; Start's router entry
   * reaches it (as a router reaches its routes), and `allowImport` allows it
   * with `Promise<true>`.
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
  const openStarted2 = closeAfterAll()
  const recorder = violationRecorder(importProtection)

  /** What the client gets, and the importers reported for the client. */
  async function outcome() {
    const server = await (started ??= openStarted2(() =>
      startDevServerShared({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: viteApp,
      }),
    ))
    const { result: value } = await runViteClient(
      server,
      '/src/router.ts',
      `${describeValuePrelude}\nreturn describeValue(globalThis.uses.allowedAsync(), 'MARK_')`,
    )
    await server.idle()
    return {
      value,
      reported: importersIn(
        { root: server.root, violations: recorder.violations },
        'client',
      ),
    }
  }

  // An import allowed by an async `allowImport` is the real module in the
  // browser, without a report.
  test(
    'the client gets the real module, and the import is not reported',
    async () => {
      expect(await outcome()).toEqual({ value: 'MARK_SECRET', reported: [] })
    },
    timeout,
  )
})
