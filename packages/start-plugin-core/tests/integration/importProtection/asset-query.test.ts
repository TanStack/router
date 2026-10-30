/**
 * Asset queries on denied files (`?raw`, `?url`, `?inline`, `?worker`), in the
 * client environment, mock mode: the module is the file's text and is never
 * compiled, whichever import form brought it (static, `import.meta.glob`,
 * template-literal `import()`, `import.meta.webpackContext`) and whichever rule
 * denies the file (file rule, `server-only` marker). The file's text never
 * reaches the client, in any emitted file, and the import is reported. Builds
 * with the `error` behaviour fail; a veto, an exempt importer of a static
 * import and `excludeFiles` give the real text; a file that is not denied keeps
 * it.
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
  ['vite', [...bothHosts, ...viteOnly]],
  ['rsbuild', [...bothHosts, ...rsbuildOnly]],
])('%s build', (bundler, forms) => {
  test.each(forms)(
    '%s is mocked and reported',
    async (_name, entry, files) => {
      const result = await buildApp(bundler, entry, files)
      expect(await emittedCanaries(result.client.outDir)).toEqual([])
      expect(clientViolations(result)).toBeGreaterThan(0)
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
    '/src/secrets.server.ts?url',
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

const patternImports: Array<[StartBundler, string]> = [
  ['vite', eagerGlob('./secrets*.ts', '?raw')],
  ['rsbuild', webpackContext('/secrets.*\\.ts$/')],
]

describe.each(patternImports)('%s build verdicts', (bundler, entry) => {
  test(
    'the error behaviour fails the build naming the importer',
    async () => {
      const error = await rejection(
        buildApp(bundler, entry, byFileRule, { behavior: 'error' }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'a veto gives the real text',
    async () => {
      const result = await buildApp(bundler, entry, byFileRule, {
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
      const result = await buildApp(bundler, entry, byFileRule, {
        ...importProtection,
        client: { excludeFiles: ['**/secrets.server.ts'] },
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
})

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

  test(
    'a server environment gets the mock of a client-only file, reported',
    async () => {
      const result = await buildStart({
        bundler,
        files: app(staticImport('./gui.client.ts?raw'), {
          'src/gui.client.ts': `export const s = '${CANARY}'\n`,
        }),
        entry: 'src/entry.ts',
        start: { importProtection },
      })
      expect(await emittedCanaries(result.ssr.outDir)).toEqual([])
      expect(
        result.violations.filter((v) => v.envType === 'server').length,
      ).toBeGreaterThan(0)
    },
    timeout,
  )
})
