/**
 * Asset queries on denied files (`?raw`, `?url`, `?inline`, `?worker`), in the
 * client environment, mock mode: the module is the file's text, never compiled
 * (or, under a query the bundler ignores on a script, the file's code:
 * asset-query-code.test.ts), whichever import form brought it (static, `import.meta.glob`,
 * template-literal `import()`, `import.meta.webpackContext`) and whichever rule
 * denies the file (file rule, `server-only` marker). The file's text never
 * reaches the client, in any emitted file, and the import is reported. Builds
 * with the `error` behaviour fail; `allowImport`, an exempt importer of a static
 * import and `excludeFiles` give the real text; a file that is not denied keeps
 * it, byte for byte. A server gets the text or URL of a client-only marked file.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, buildStartShared } from '../../build-harness'
import {
  rejection,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  clientResult,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserStartDevServerShared as startDevServerShared,
  startBrowserRsbuildStartDevServerShared as startRsbuildStartDevServerShared,
} from './client-pages'
import { importersIn } from './hosts'
import {
  CANARY,
  app,
  buildApp,
  byFileRule,
  byMarker,
  canaryOf,
  clientViolations,
  eagerGlob,
  emittedCanaries,
  formDir,
  formsApp,
  importProtection,
  lazyGlob,
  readFormTexts,
  staticImport,
  templateImport,
  textFile,
  timeout,
  webpackContext,
} from './asset-query-app'
import type { Files } from './asset-query-app'
import type { StartBundler } from '../../build-harness'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const bothHosts: Array<[string, string, Files]> = [
  ['a marked file, static ?raw', staticImport('./marked.ts?raw'), byMarker],
  ['a marked file, static ?url', staticImport('./marked.ts?url'), byMarker],
  [
    'a marked file, static ?inline',
    staticImport('./marked.ts?inline'),
    byMarker,
  ],
  [
    'a denied file, static ?raw',
    staticImport('./secrets.server.ts?raw'),
    byFileRule,
  ],
  [
    'a denied text file, static ?raw',
    staticImport('./notes.server.txt?raw'),
    textFile,
  ],
  [
    'a denied file, template ?raw',
    templateImport('secrets', '.server.ts?raw'),
    byFileRule,
  ],
  [
    'a denied file, template ?url',
    templateImport('secrets', '.server.ts?url'),
    byFileRule,
  ],
  [
    'a marked file, template ?raw',
    templateImport('marked', '.ts?raw'),
    byMarker,
  ],
]
const viteOnly: Array<[string, string, Files]> = [
  [
    'a denied text file, static ?url',
    staticImport('./notes.server.txt?url'),
    textFile,
  ],
  [
    'a denied text file, eager glob ?url',
    eagerGlob('./*.server.txt', '?url'),
    textFile,
  ],
  [
    'a denied file, eager glob ?raw',
    eagerGlob('./secrets*.ts', '?raw'),
    byFileRule,
  ],
  [
    'a denied file, lazy glob ?raw',
    lazyGlob('./secrets*.ts', '?raw'),
    byFileRule,
  ],
  [
    'a denied file, eager glob ?url',
    eagerGlob('./secrets*.ts', '?url'),
    byFileRule,
  ],
  [
    'a denied file, eager glob ?inline',
    eagerGlob('./secrets*.ts', '?inline'),
    byFileRule,
  ],
  [
    'a marked file, eager glob ?raw',
    eagerGlob('./marked*.ts', '?raw'),
    byMarker,
  ],
  [
    'a denied text file, eager glob ?raw',
    eagerGlob('./*.server.txt', '?raw'),
    textFile,
  ],
]
const viteBuildOnly: Array<[string, string, Files]> = [
  [
    'a marked file, static ?worker',
    staticImport('./marked.ts?worker'),
    byMarker,
  ],
  [
    'a denied file, lazy glob ?worker',
    lazyGlob('./secrets*.ts', '?worker'),
    byFileRule,
  ],
  [
    'a denied file, lazy glob ?sharedworker',
    lazyGlob('./secrets*.ts', '?sharedworker'),
    byFileRule,
  ],
  [
    'a denied file, a hash after ?raw',
    eagerGlob('./secrets*.ts', '?raw#a'),
    byFileRule,
  ],
]
const rsbuildOnly: Array<[string, string, Files]> = [
  [
    'a denied file, webpackContext ?raw',
    webpackContext('/secrets.*\\.ts$/'),
    byFileRule,
  ],
  [
    'a marked file, webpackContext ?raw',
    webpackContext('/marked.*\\.ts$/'),
    byMarker,
  ],
  [
    'a denied text file, webpackContext ?raw',
    webpackContext('/server\\.txt$/'),
    textFile,
  ],
]

/** `forms` with each form's index (its canary and reader in `formsApp`). */
const indexed = (forms: Array<[string, string, Files]>) =>
  forms.map(([name, entry, files], i) => [name, entry, files, i] as const)

/** Whether `file` is one of the form `name` of `formsApp`. */
const inForm = (name: string) => (file: string) =>
  file.startsWith(`${formDir(name)}/`)

/**
 * Who a dev server reports for the form `name`: the importer of a static
 * import; for a pattern import, which has no report of its own (SPEC J6.7),
 * the denied file it reaches, served as its mock.
 */
const devReported = (name: string, entry: string, files: Files) =>
  entry.startsWith('import * as module from')
    ? [`${formDir(name)}/entry.ts`]
    : Object.keys(files).map((file) =>
        file.replace(/^src\//, `${formDir(name)}/`),
      )

describe.each<[StartBundler, Array<[string, string, Files]>]>([
  ['vite', [...bothHosts, ...viteOnly, ...viteBuildOnly]],
  ['rsbuild', [...bothHosts, ...rsbuildOnly]],
])('%s build', (bundler, forms) => {
  // every form in one app: what each emitted file holds of each form's
  // canary (all output, `data:` URLs decoded), and the importers reported
  let emitted: Array<Awaited<ReturnType<typeof emittedCanaries>>>
  let importers: ReturnType<typeof importersIn>
  let opening: Promise<{ close: () => Promise<void> }> | undefined
  afterAll(() =>
    opening?.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  beforeAll(async () => {
    const result = await (opening = buildStartShared({
      bundler,
      files: formsApp(forms),
      entry: 'src/entry.ts',
      start: { importProtection },
    }))
    emitted = await Promise.all(
      forms.map((_, i) => emittedCanaries(result.client.outDir, canaryOf(i))),
    )
    importers = importersIn(result, 'client')
  }, timeout)

  test.each(indexed(forms))(
    '%s is mocked and reported',
    (name, _entry, _files, i) => {
      expect(emitted[i]).toEqual([])
      expect(importers.filter(inForm(name))).toEqual([
        `${formDir(name)}/entry.ts`,
      ])
    },
    timeout,
  )

  test(
    'every form is reported, and nothing else',
    () => {
      expect(importers).toEqual(
        forms.map(([name]) => `${formDir(name)}/entry.ts`).sort(),
      )
    },
    timeout,
  )

  test(
    'with a persistent cache, a restored build is mocked and reported too',
    async () => {
      const result = await buildStart({
        bundler,
        files: app(
          bundler === 'vite'
            ? eagerGlob('./secrets*.ts', '?raw')
            : webpackContext('/secrets.*\\.ts$/'),
          byFileRule,
        ),
        entry: 'src/entry.ts',
        builds: 2,
        ...(bundler === 'rsbuild' && {
          rsbuildConfig: { performance: { buildCache: true } },
        }),
        start: { importProtection },
      })
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
      expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'a file that loses its marker in a watch build is its text again, unreported',
    async () => {
      const result = await buildStart({
        bundler,
        files: app(
          bundler === 'vite'
            ? eagerGlob('./marked*.ts', '?raw')
            : webpackContext('/marked.*\\.ts$/'),
          byMarker,
        ),
        entry: 'src/entry.ts',
        start: { importProtection },
        watchEdits: { 'src/marked.ts': `export const s = '${CANARY}'\n` },
      })
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      // (what the rebuild reported)
      expect(clientViolations(result)).toBe(0)
    },
    timeout,
  )

  test(
    'an unused bare import is erased: no report, the error behaviour builds',
    async () => {
      const result = await buildApp(
        bundler,
        `import './marked.ts?raw'\n`,
        byMarker,
        { behavior: 'error' },
      )
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
    },
    timeout,
  )

  test(
    'an asset that is not denied keeps its bytes',
    async () => {
      const result = await buildStart({
        bundler,
        files: app(
          `import url from './logo.png?url'
;(globalThis as any).url = url
`,
          // a byte order mark: a loader decoding the file would drop it
          { 'src/logo.png': `\uFEFF${'0123456789'.repeat(1024)}` },
        ),
        entry: 'src/entry.ts',
        // (a production client of one asset module reads a Rspack runtime
        // name the harness's dangling-name check rejects; bytes are the same)
        mode: 'development',
        start: { importProtection },
      })
      const emitted = (
        await readdir(result.client.outDir, {
          recursive: true,
          withFileTypes: true,
        })
      ).find((entry) => entry.isFile() && entry.name.endsWith('.png'))
      const bytes = await readFile(
        path.join(emitted!.parentPath, emitted!.name),
      )
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    },
    timeout,
  )
})

describe('vite dev', () => {
  const forms = [...bothHosts, ...viteOnly]
  // every form in one app: the importers reported once a page ran every
  // reader (lazy imports included), before any row reads them; each row
  // then reads its own form in a page of its own
  let served: { server: DevServer; importers: Array<string> }
  let opening: Promise<{ close: () => Promise<void> }> | undefined
  afterAll(() =>
    opening?.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  beforeAll(async () => {
    const recorder = violationRecorder(importProtection)
    const server = await (opening = startDevServerShared({
      browser: true,
      start: { importProtection: recorder.importProtection },
      files: formsApp(forms),
    }))
    await runViteClient(
      server,
      '/src/router.ts',
      readFormTexts({ count: forms.length }),
    )
    await server.idle()
    served = {
      server,
      importers: importersIn({ root: server.root, ...recorder }, 'client'),
    }
  }, timeout)

  test.each(indexed(forms))(
    '%s is mocked and reported',
    async (name, entry, files, i) => {
      const { server, importers } = served
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        readFormTexts({ index: i }),
      )
      // (the reader read something: a value, a URL's content)
      expect(result).toMatch(/./)
      expect(result).not.toContain(canaryOf(i))
      expect(importers.filter(inForm(name))).toEqual(
        devReported(name, entry, files),
      )
    },
    timeout,
  )

  test(
    'every form is reported, and nothing else',
    () => {
      expect(served.importers).toEqual(
        forms
          .flatMap(([name, entry, files]) => devReported(name, entry, files))
          .sort(),
      )
    },
    timeout,
  )

  test.each([
    '/src/secrets.server.ts?raw',
    '/src/secrets.server.ts?inline',
    '/src/marked.ts?raw',
  ])(
    'a direct request for %s never gets the text',
    async (url) => {
      const server = await startDevServer({
        browser: true,
        start: { importProtection },
        files: app('export {}\n', { ...byFileRule, ...byMarker }),
      })
      const response = await fetch(new URL(url, server.url))
      expect(await response.text()).not.toContain(CANARY)
    },
    timeout,
  )

  test(
    'a file that gains a marker is mocked from then on',
    async () => {
      const server = await startDevServer({
        browser: true,
        start: { importProtection },
        files: app('export {}\n', {
          'src/later.ts': `export const s = '${CANARY}'\n`,
        }),
      })
      const url = new URL('/src/later.ts?raw', server.url)
      expect(await (await fetch(url)).text()).toContain(CANARY)
      await server.edit({
        'src/later.ts': `import '@tanstack/react-start/server-only'
export const s = '${CANARY}'
`,
      })
      await expect
        .poll(async () => (await fetch(url)).text(), { timeout: 10_000 })
        .not.toContain(CANARY)
      await server.edit({ 'src/later.ts': `export const s = '${CANARY}'\n` })
      await expect
        .poll(async () => (await fetch(url)).text(), { timeout: 10_000 })
        .toContain(CANARY)
    },
    timeout,
  )
})

test(
  'vite bundledDev: a glob ?raw of a denied file is mocked and reported',
  async () => {
    const server = await startProtectedDevServer(
      app(eagerGlob('./secrets*.ts', '?raw'), byFileRule),
      { mockAccess: 'off' },
      { router: 'src/router.ts', bundledDev: { entry: 'src/router.ts' } },
    )
    const bundle = Object.values(await server.clientBundle()).join('\n')
    expect(bundle).not.toContain(CANARY)
    expect(importersIn(server, 'client')).toEqual(['src/secrets.server.ts'])
  },
  timeout,
)

describe('rsbuild dev', () => {
  const forms = [...bothHosts, ...rsbuildOnly]
  // every form in one app (as on Vite): the reports once a page ran every
  // reader, then a page of its own per row
  let served: { server: RsbuildDevServer; importers: Array<string> }
  let opening: Promise<{ close: () => Promise<void> }> | undefined
  afterAll(() =>
    opening?.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  beforeAll(async () => {
    const recorder = violationRecorder(importProtection)
    const server = await (opening = startRsbuildStartDevServerShared({
      compileTimeout: timeout,
      browser: true,
      hmr: false,
      files: formsApp(forms),
      start: { importProtection: recorder.importProtection },
    }))
    await captureConsole(() =>
      clientResult(server, readFormTexts({ count: forms.length })),
    )
    served = {
      server,
      importers: importersIn({ root: server.root, ...recorder }, 'client'),
    }
  }, timeout)

  test.each(indexed(forms))(
    '%s is mocked and reported',
    async (name, entry, files, i) => {
      const { server, importers } = served
      const { result } = await captureConsole(() =>
        clientResult(server, readFormTexts({ index: i })),
      )
      // (the reader read something: a value, a URL's content)
      expect(result).toMatch(/./)
      expect(result).not.toContain(canaryOf(i))
      expect(importers.filter(inForm(name))).toEqual(
        devReported(name, entry, files),
      )
    },
    timeout,
  )

  test(
    'every form is reported, and nothing else',
    () => {
      expect(served.importers).toEqual(
        forms
          .flatMap(([name, entry, files]) => devReported(name, entry, files))
          .sort(),
      )
    },
    timeout,
  )
})

const patternImports: Array<[StartBundler, string, string, Files]> = [
  ['vite', 'a file rule', eagerGlob('./secrets*.ts', '?raw'), byFileRule],
  ['vite', 'a marker', eagerGlob('./marked*.ts', '?raw'), byMarker],
  ['rsbuild', 'a file rule', webpackContext('/secrets.*\\.ts$/'), byFileRule],
  ['rsbuild', 'a marker', webpackContext('/marked.*\\.ts$/'), byMarker],
]

describe.each(patternImports)(
  '%s build verdicts, %s',
  (bundler, rule, entry, denied) => {
    const file = Object.keys(denied)[0]!
    test(
      'the error behaviour fails the build naming the importer',
      async () => {
        const error = await rejection(
          buildApp(bundler, entry, denied, { behavior: 'error' }),
        )
        expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
      },
      timeout,
    )

    test(
      'allowImport gives the real text',
      async () => {
        const result = await buildApp(bundler, entry, denied, {
          ...importProtection,
          allowImport: () => true,
        })
        expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      },
      timeout,
    )

    // (a file name only: `excludeFiles` never hides a marker, SPEC J6.1)
    if (rule === 'a file rule') {
      test(
        '`excludeFiles` gives the real text, unreported',
        async () => {
          const result = await buildApp(bundler, entry, denied, {
            ...importProtection,
            client: { excludeFiles: [`**/${path.basename(file)}`] },
          })
          expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
          expect(clientViolations(result)).toBe(0)
        },
        timeout,
      )
    }

    test(
      'a file that is not denied keeps its text, unreported',
      async () => {
        const result = await buildApp(
          bundler,
          bundler === 'vite'
            ? eagerGlob('./plain*.ts', '?raw')
            : webpackContext('/plain.*\\.ts$/'),
          { 'src/plain.ts': `export const s = '${CANARY}'\n` },
        )
        expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
        expect(clientViolations(result)).toBe(0)
      },
      timeout,
    )
  },
)

describe.each<StartBundler>(['vite', 'rsbuild'])('%s build', (bundler) => {
  test(
    'an exempt importer of a static ?raw import gets the real text, unreported',
    async () => {
      const result = await buildApp(
        bundler,
        `import './exempt/reader'\n`,
        {
          ...byFileRule,
          'src/exempt/reader.ts': `import text from '../secrets.server.ts?raw'
;(globalThis as any).text = text
`,
        },
        { ...importProtection, ignoreImporters: ['**/exempt/**'] },
      )
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      expect(clientViolations(result)).toBe(0)
    },
    timeout,
  )

  test.each([
    [
      'a glob ?raw of a client-only named file',
      bundler === 'vite'
        ? eagerGlob('./gui*.ts', '?raw')
        : webpackContext('/gui.*\\.ts$/'),
      { 'src/gui.client.ts': `export const s = '${CANARY}'\n` },
    ],
    [
      'a static ?raw of a client-only marked file',
      staticImport('./gui.ts?raw'),
      {
        'src/gui.ts': `import '@tanstack/react-start/client-only'
export const s = '${CANARY}'
`,
      },
    ],
  ])(
    '%s: a server keeps the text, and the build passes',
    async (_name, entry, files) => {
      const result = await buildApp(bundler, entry, files, {
        behavior: 'error',
      })
      expect(await emittedCanaries(result.ssr.outDir)).not.toEqual([])
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    },
    timeout,
  )
})

test(
  'vite build: a virtual module with a query keeps its own marker',
  async () => {
    const id = 'virtual:thing?variant=a'
    const result = await buildStart({
      bundler: 'vite',
      files: app(staticImport(id), {}),
      entry: 'src/entry.ts',
      start: { importProtection },
      viteConfig: {
        plugins: [
          {
            name: 'virtual-thing',
            resolveId: (source) => (source === id ? `\0${id}` : null),
            load: (loaded) =>
              loaded === `\0${id}`
                ? `import '@tanstack/react-start/server-only'
export const s = '${CANARY}'
`
                : null,
          },
        ],
      },
    })
    expect(await emittedCanaries(result.client.outDir)).toEqual([])
    expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
  },
  timeout,
)
