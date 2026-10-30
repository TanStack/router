/**
 * Asset queries on denied files (`?raw`, `?url`, `?inline`, `?worker`), in the
 * client environment, mock mode: the module is the file's text and is never
 * compiled, whichever import form brought it (static, `import.meta.glob`,
 * template-literal `import()`, `import.meta.webpackContext`) and whichever rule
 * denies the file (file rule, `server-only` marker). The file's text never
 * reaches the client, in any emitted file, and the import is reported. Builds
 * with the `error` behaviour fail; a veto, an exempt importer of a static
 * import and `excludeFiles` give the real text; a file that is not denied keeps
 * it, byte for byte. A server gets the text or URL of a client-only marked file.
 * The file rule judges the denied file wherever it lives: outside the source
 * directory, or a file no compile reads (`*.server.json` in a glob, Rsbuild's
 * `new URL` of a text file); a dependency's own files stay out of it.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  rejection,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './v2-hosts'
import type { StartBundler } from '../../build-harness'

const timeout = 60_000

const CANARY = 'CANARY_DENIED_TEXT'

const app = (entry: string, files: Record<string, string>) => ({
  ...files,
  'src/entry.ts': entry,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
})

/** A denied file by rule: `?raw` etc. are appended by each form. */
const byFileRule = {
  'src/secrets.server.ts': `export const s = '${CANARY}'\n`,
}
const byMarker = {
  'src/marked.ts': `import '@tanstack/react-start/server-only'
export const s = '${CANARY}'
`,
}
const textFile = { 'src/notes.server.txt': CANARY }

/** A module's value as text (a mock is a callable proxy; its text is a placeholder). */
const toText = `const toText = (m: any) => {
  const value = m?.default ?? m
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
};
`
const exposing = (values: string) =>
  `${toText}(globalThis as any).texts = async () => ${values}\n`

const staticImport = (specifier: string) =>
  `import * as module from '${specifier}'\n${exposing('[toText(module)]')}`
const eagerGlob = (pattern: string, query: string) =>
  `const modules = import.meta.glob('${pattern}', { query: '${query}', eager: true });\n${exposing('Object.values(modules).map(toText)')}`
const lazyGlob = (pattern: string, query: string) =>
  `const modules = import.meta.glob('${pattern}', { query: '${query}' });\n${exposing('Promise.all(Object.values(modules).map((load: any) => load().then(toText)))')}`
const templateImport = (name: string, suffix: string) =>
  `${toText}(globalThis as any).texts = async (name = '${name}') => [toText(await import(\`./\${name}${suffix}\`))]\n`
const webpackContext = (regExp: string) =>
  `const context = (import.meta as any).webpackContext('./?raw', { recursive: false, regExp: ${regExp} });\n${exposing('context.keys().map((key: string) => toText(context(key)))')}`

type Files = Record<string, string>
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

/** Whether an emitted file holds the canary, as it is or as a base64 `data:` URL (`?inline`). */
async function emittedCanaries(dir: string): Promise<Array<string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const hits: Array<string> = []
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const file = path.join(entry.parentPath, entry.name)
    const text = await readFile(file, 'latin1')
    const inlined = [...text.matchAll(/;base64,([A-Za-z0-9+/=]+)/g)].map((m) =>
      Buffer.from(m[1]!, 'base64').toString('latin1'),
    )
    if ([text, ...inlined].some((t) => t.includes(CANARY))) {
      hits.push(file)
    }
  }
  return hits
}

const importProtection = { behavior: 'mock', mockAccess: 'off' } as const

const clientViolations = (build: { violations: Array<{ envType: string }> }) =>
  build.violations.filter((v) => v.envType === 'client').length

const buildApp = (
  bundler: StartBundler,
  entry: string,
  files: Files,
  options: Record<string, unknown> = importProtection,
) =>
  buildStart({
    bundler,
    files: app(entry, files),
    entry: 'src/entry.ts',
    start: { importProtection: options },
  })

describe.each<[StartBundler, Array<[string, string, Files]>]>([
  ['vite', [...bothHosts, ...viteOnly, ...viteBuildOnly]],
  ['rsbuild', [...bothHosts, ...rsbuildOnly]],
])('%s build', (bundler, forms) => {
  test.each(forms)(
    '%s is mocked and reported',
    async (_name, entry, files) => {
      const result = await buildApp(bundler, entry, files)
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
      expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
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

/** The page's texts, and for each a URL's content (`?url`) or a `data:` URL's. */
const readTexts = `const out = []
for (const value of await globalThis.texts()) {
  out.push(value)
  if (value.startsWith('data:')) {
    out.push(atob(value.split(',')[1]))
  } else if (value.startsWith('/') || value.startsWith('http')) {
    out.push(await (await fetch(value)).text())
  }
}
return out.join('\\n')`

describe('vite dev', () => {
  test.each([...bothHosts, ...viteOnly])(
    '%s is mocked and reported',
    async (_name, entry, files) => {
      const recorder = violationRecorder(importProtection)
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: app(entry, files),
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        readTexts,
      )
      await server.idle()
      expect(String(result)).not.toContain(CANARY)
      expect(clientViolations(recorder)).toBeGreaterThan(0)
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
  test.each([...bothHosts, ...rsbuildOnly])(
    '%s is mocked and reported',
    async (_name, entry, files) => {
      const recorder = violationRecorder(importProtection)
      const server = await startRsbuildStartDevServer({
        compileTimeout: timeout,
        browser: true,
        hmr: false,
        files: app(entry, files),
        start: { importProtection: recorder.importProtection },
      })
      const { result } = await captureConsole(() =>
        runInClient(server, readTexts),
      )
      expect(String((result as { result: unknown }).result)).not.toContain(
        CANARY,
      )
      expect(clientViolations(recorder)).toBeGreaterThan(0)
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
  (bundler, _rule, entry, denied) => {
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
      'a veto gives the real text',
      async () => {
        const result = await buildApp(bundler, entry, denied, {
          ...importProtection,
          onViolation: () => false,
        })
        expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      },
      timeout,
    )

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

/** Denied files wherever they live, and the files the rule leaves alone: the scope is about importers. */
const secretsIn = (dir: string) => ({
  [`${dir}/s.server.ts`]: `export const s = '${CANARY}'\n`,
})
const plainGlob = (pattern: string) =>
  `const modules = import.meta.glob('${pattern}', { eager: true });\n${exposing('Object.values(modules).map(toText)')}`

describe.each<[string, string, Files]>([
  [
    'a denied file outside the source directory, glob ?raw',
    eagerGlob('../lib/*.server.ts', '?raw'),
    secretsIn('lib'),
  ],
  [
    'a denied file outside the source directory, plain glob',
    plainGlob('../lib/*.server.ts'),
    secretsIn('lib'),
  ],
  [
    'a denied JSON file, plain glob',
    plainGlob('./*.server.json'),
    { 'src/a.server.json': `{"a":"${CANARY}"}` },
  ],
  ['a denied text file, plain glob', plainGlob('./*.server.txt'), textFile],
])('vite: %s', (_name, entry, files) => {
  test(
    'a build mocks and reports it',
    async () => {
      const result = await buildApp('vite', entry, files)
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
      expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'the error behaviour fails the build naming the importer',
    async () => {
      const error = await rejection(
        buildApp('vite', entry, files, { behavior: 'error' }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'a veto gives the real file',
    async () => {
      const result = await buildApp('vite', entry, files, {
        ...importProtection,
        onViolation: () => false,
      })
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    },
    timeout,
  )

  test(
    'a dev server mocks and reports it',
    async () => {
      const recorder = violationRecorder(importProtection)
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: app(entry, files),
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        readTexts,
      )
      await server.idle()
      expect(String(result)).not.toContain(CANARY)
      expect(clientViolations(recorder)).toBeGreaterThan(0)
    },
    timeout,
  )
})

describe.each<[string, string, Files]>([
  [
    'a denied file outside the source directory, template ?raw',
    `${toText}(globalThis as any).texts = async (name = 's') => [toText(await import(\`../lib/\${name}.server.ts?raw\`))]\n`,
    secretsIn('lib'),
  ],
  [
    'a denied file outside the source directory, plain template',
    `${toText}(globalThis as any).texts = async (name = 's') => [toText(await import(\`../lib/\${name}.server.ts\`))]\n`,
    secretsIn('lib'),
  ],
  [
    'a denied text file, new URL',
    exposing(`[new URL('./notes.server.txt', import.meta.url).href]`),
    textFile,
  ],
])('rsbuild: %s', (_name, entry, files) => {
  test(
    'a build mocks and reports it',
    async () => {
      const result = await buildApp('rsbuild', entry, files)
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
      expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'the error behaviour fails the build naming the importer',
    async () => {
      const error = await rejection(
        buildApp('rsbuild', entry, files, { behavior: 'error' }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'a dev server mocks and reports it',
    async () => {
      const recorder = violationRecorder(importProtection)
      const server = await startRsbuildStartDevServer({
        compileTimeout: timeout,
        browser: true,
        hmr: false,
        files: app(entry, files),
        start: { importProtection: recorder.importProtection },
      })
      const { result } = await captureConsole(() =>
        runInClient(server, readTexts),
      )
      expect(String((result as { result: unknown }).result)).not.toContain(
        CANARY,
      )
      expect(clientViolations(recorder)).toBeGreaterThan(0)
    },
    timeout,
  )
})

describe.each<[StartBundler, string]>([
  ['vite', plainGlob('./*.json')],
  ['rsbuild', exposing(`[new URL('./plain.txt', import.meta.url).href]`)],
])('%s: what no rule denies', (bundler, entry) => {
  test(
    'a data file reached by a pattern keeps its text, unreported',
    async () => {
      const result = await buildApp(bundler, entry, {
        'src/plain.json': `{"a":"${CANARY}"}`,
        'src/plain.txt': CANARY,
      })
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      expect(clientViolations(result)).toBe(0)
    },
    timeout,
  )
})

test(
  'a dependency keeps its own denied-looking file: its importer is no app module',
  async () => {
    const result = await buildApp('vite', staticImport('dep'), {
      'node_modules/dep/package.json': `{"name":"dep","type":"module","exports":"./index.js"}`,
      'node_modules/dep/index.js': `export { s } from './own.server.js'\n`,
      'node_modules/dep/own.server.js': `export const s = '${CANARY}'\n`,
    })
    expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    expect(clientViolations(result)).toBe(0)
  },
  timeout,
)

test(
  'a server keeps a client-only named file outside the source directory, and the build passes',
  async () => {
    const result = await buildApp(
      'vite',
      plainGlob('../lib/*.client.ts'),
      { 'lib/gui.client.ts': `export const s = '${CANARY}'\n` },
      { behavior: 'error' },
    )
    expect(await emittedCanaries(result.ssr.outDir)).not.toEqual([])
  },
  timeout,
)

describe.each<StartBundler>(['vite', 'rsbuild'])(
  '%s build: an importer outside the source directory',
  (bundler) => {
    const lib = {
      ...secretsIn('lib'),
      'lib/a.ts': `import { s } from './s.server'
export const read = () => s
`,
    }

    test(
      'gets the real module of a denied file outside it too, unreported',
      async () => {
        const result = await buildApp(
          bundler,
          `import { read } from '../lib/a'
;(globalThis as any).read = read
`,
          lib,
          { behavior: 'error' },
        )
        expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      },
      timeout,
    )

    test(
      'next to an importer in the scope, which gets the mock and is reported',
      async () => {
        const result = await buildApp(
          bundler,
          `import { read } from '../lib/a'
import { s } from '../lib/s.server'
;(globalThis as any).reads = [read, s]
`,
          lib,
        )
        expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
      },
      timeout,
    )
  },
)
