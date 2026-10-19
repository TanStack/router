/**
 * `client.files` and `server.files` replace the default file rules (FIX-PLAN
 * V2-21; SPEC J6.1, docs table "replaces defaults"): with `client.files:
 * ['**\/private/**']`, a live client import of `src/private/db.ts` is denied,
 * and one of `src/db.server.ts` no longer is (the client gets the real
 * module, nothing is reported); the marker and specifier rules still apply.
 * Mirror on the server with `server.files: ['**\/browser/**']`:
 * `src/browser/storage.ts` is denied, `src/widget.client.ts` no longer is,
 * and the client-only marker still applies. Each use lives in a module of
 * its own (`src/uses/<name>.ts`), so the reports tell the edges apart. Mock
 * mode (dev default; `behavior: 'mock'` in builds), Vite and Rsbuild, builds
 * and dev servers with Start's whole plugin.
 */
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { startDevServer } from '../../dev-server'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import {
  runInClient,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { reportedImporters, runRsbuildSsr } from './v2-hosts'
import type { ReportOutput } from '../../importProtection/violation-report'
import type { StartBuild } from '../../build-harness'
import type { ImportProtectionOptions } from '../../../src/schema'

const timeout = 60_000
const compileTimeout = timeout

const importProtection: ImportProtectionOptions = {
  client: { files: ['**/private/**'] },
  server: { files: ['**/browser/**'] },
  mockAccess: 'off',
}

/** A module that records that it ran, then gives `value`. */
const recording = (name: string, value: string, head = '') =>
  `${head};((globalThis as any).loaded ??= []).push('${name}')
export const ${name} = () => '${value}'
`

const app = {
  // Denied to the client by the default rule only
  'src/db.server.ts': recording('db', 'MARK_DB'),
  // Denied to the client by the configured rule
  'src/private/db.ts': recording('privateDb', 'MARK_PRIVATE'),
  // Denied to the client by its marker
  'src/marked.ts': recording(
    'marked',
    'MARK_MARKED',
    `import '@tanstack/react-start/server-only'\n`,
  ),
  // Denied to the server by the default rule only
  'src/widget.client.ts': recording('widget', 'MARK_WIDGET'),
  // Denied to the server by the configured rule
  'src/browser/storage.ts': recording('storage', 'MARK_STORAGE'),
  // Denied to the server by its marker
  'src/client-marked.ts': recording(
    'clientMarked',
    'MARK_CLIENT_MARKED',
    `import '@tanstack/react-start/client-only'\n`,
  ),
  'src/uses/db.ts': `import { db } from '../db.server'\nexport default () => db()\n`,
  'src/uses/private.ts': `import { privateDb } from '../private/db'\nexport default () => privateDb()\n`,
  'src/uses/marked.ts': `import { marked } from '../marked'\nexport default () => marked()\n`,
  // Denied to the client by the default specifier rule
  'src/uses/request.ts': `import { getRequest } from '@tanstack/react-start/server'\nexport default () => getRequest()\n`,
  'src/uses/widget.ts': `import { widget } from '../widget.client'\nexport default () => widget()\n`,
  'src/uses/storage.ts': `import { storage } from '../browser/storage'\nexport default () => storage()\n`,
  'src/uses/client-marked.ts': `import { clientMarked } from '../client-marked'\nexport default () => clientMarked()\n`,
  'src/entry.ts': `import db from './uses/db'
import privateDb from './uses/private'
import marked from './uses/marked'
import request from './uses/request'
import widget from './uses/widget'
import storage from './uses/storage'
import clientMarked from './uses/client-marked'
;(globalThis as any).uses = { db, privateDb, marked, request, widget, storage, clientMarked }
`,
  // Start's router entry reaches the app's modules, as a router reaches its
  // routes.
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}

/** The uses each environment calls (`getRequest` needs no server here). */
const usesOf = {
  client: ['db', 'privateDb'],
  server: ['widget', 'storage'],
} as const

/**
 * A script (`describeValuePrelude`) giving what each use of `names` returns,
 * described (`a safe mock`, or the value's text), and the modules that ran.
 */
const readScript = (names: ReadonlyArray<string>) => `${describeValuePrelude}
const values = {}
for (const name of ${JSON.stringify(names)}) {
  try {
    values[name] = describeValue(globalThis.uses[name](), 'MARK_')
  } catch (error) {
    values[name] = 'throws: ' + String(error)
  }
}
return { values, loaded: globalThis.loaded ?? [] }`

interface Read {
  values: Record<string, string>
  loaded: Array<string>
}

/**
 * What one environment's run shows: per use, its value and whether its
 * module ran, and per denied edge whether it is reported.
 */
function outcome(
  environment: 'client' | 'server',
  read: Read,
  output: ReportOutput,
) {
  const reported = reportedImporters(output, environment)
  const isReported = (importer: string, marked?: string) =>
    reported.includes(importer) ||
    (marked !== undefined && reported.includes(marked))
  if (environment === 'client') {
    return {
      'db.server.ts (no longer denied)': {
        value: read.values.db,
        ran: read.loaded.includes('db'),
        reported: isReported('src/uses/db.ts'),
      },
      'private/db.ts (denied by client.files)': {
        value: read.values.privateDb,
        ran: read.loaded.includes('privateDb'),
        reported: isReported('src/uses/private.ts'),
      },
      // A marker violation may be reported at the marked module (audit F
      // ASK-1).
      'the server-only marker': {
        reported: isReported('src/uses/marked.ts', 'src/marked.ts'),
      },
      'the server specifier': { reported: isReported('src/uses/request.ts') },
    }
  }
  return {
    'widget.client.ts (no longer denied)': {
      value: read.values.widget,
      ran: read.loaded.includes('widget'),
      reported: isReported('src/uses/widget.ts'),
    },
    'browser/storage.ts (denied by server.files)': {
      value: read.values.storage,
      ran: read.loaded.includes('storage'),
      reported: isReported('src/uses/storage.ts'),
    },
    'the client-only marker': {
      reported: isReported('src/uses/client-marked.ts', 'src/client-marked.ts'),
    },
  }
}

const expected = {
  client: {
    'db.server.ts (no longer denied)': {
      value: 'MARK_DB',
      ran: true,
      reported: false,
    },
    'private/db.ts (denied by client.files)': {
      value: 'a safe mock',
      ran: false,
      reported: true,
    },
    'the server-only marker': { reported: true },
    'the server specifier': { reported: true },
  },
  server: {
    'widget.client.ts (no longer denied)': {
      value: 'MARK_WIDGET',
      ran: true,
      reported: false,
    },
    'browser/storage.ts (denied by server.files)': {
      value: 'a safe mock',
      ran: false,
      reported: true,
    },
    'the client-only marker': { reported: true },
  },
}

describe.each(startBundlers)('%s build (mock mode)', (bundler) => {
  let built: Promise<StartBuild> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())
  const build = () =>
    (built ??= buildStart({
      bundler,
      files: app,
      entry: 'src/entry.ts',
      start: { importProtection: { ...importProtection, behavior: 'mock' } },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    }))

  test(
    'client.files replaces the default file rule of the client',
    async () => {
      const { client } = await build()
      const { result } = await client.run(readScript(usesOf.client))
      expect(outcome('client', result as Read, client.warnings)).toEqual(
        expected.client,
      )
    },
    timeout,
  )

  test(
    'server.files replaces the default file rule of the server',
    async () => {
      const { ssr } = await build()
      const { result } = await ssr.run(readScript(usesOf.server))
      expect(outcome('server', result as Read, ssr.warnings)).toEqual(
        expected.server,
      )
    },
    timeout,
  )
})

describe('vite dev', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).loaded
    delete (globalThis as Record<string, unknown>).uses
  })

  // One dev server for both environments.
  let started: ReturnType<typeof startDevServer> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())

  /** Runs the app from Start's router entry in `environment`. */
  async function run(environment: 'client' | 'server') {
    const server = await (started ??= startDevServer({
      start: { importProtection },
      files: app,
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    }))
    const { result } = await captureConsole(async () => {
      if (environment === 'client') {
        await evaluateServed(server, '/src/router.ts')
      } else {
        await server.import('/src/router.ts', 'ssr')
      }
      const { uses, loaded = [] } = globalThis as unknown as {
        uses: Record<string, () => unknown>
        loaded?: Array<string>
      }
      return {
        values: Object.fromEntries(
          usesOf[environment].map((name) => [
            name,
            describeValue(uses[name]!(), 'MARK_'),
          ]),
        ),
        loaded: [...loaded],
      }
    })
    await server.idle()
    return outcome(environment, result, server.logs)
  }

  test(
    'client.files replaces the default file rule of the client',
    async () => {
      expect(await run('client')).toEqual(expected.client)
    },
    timeout,
  )

  test(
    'server.files replaces the default file rule of the server',
    async () => {
      expect(await run('server')).toEqual(expected.server)
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  // One dev server for both environments.
  let started: ReturnType<typeof startRsbuildStartDevServer> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())
  const start = () =>
    (started ??= startRsbuildStartDevServer({
      compileTimeout,
      files: app,
      start: { importProtection },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    }))

  test(
    'client.files replaces the default file rule of the client',
    async () => {
      const server = await start()
      const ran = await runInClient(server, readScript(usesOf.client))
      expect(ran).toEqual({ result: expect.anything() })
      expect(
        outcome(
          'client',
          (ran as { result: Read }).result,
          findDiagnostics(server.diagnostics, { severity: 'warning' }),
        ),
      ).toEqual(expected.client)
    },
    timeout,
  )

  test(
    'server.files replaces the default file rule of the server',
    async () => {
      const server = await start()
      const ran = await runRsbuildSsr(server, readScript(usesOf.server))
      expect(ran).toEqual({ result: expect.anything() })
      expect(
        outcome(
          'server',
          (ran as { result: Read }).result,
          findDiagnostics(server.diagnostics, { severity: 'warning' }),
        ),
      ).toEqual(expected.server)
    },
    timeout,
  )
})
