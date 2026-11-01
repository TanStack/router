/**
 * The file rule judges the denied file itself, wherever it lives; the scope is
 * about importers. On a client, a pattern reaching a denied file outside the
 * scope or exempted by `exclude`, a plain glob of a denied data file and
 * Rsbuild's `new URL` of a denied text file are mocked and reported. An importer
 * outside the scope keeps the real module of a denied file outside it too
 * (J6.7), `excludeFiles` skips the file rule and the marker, a dependency's own
 * files stay out of it, and other plugins' virtual assets load untouched.
 */
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { rejection, violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './v2-hosts'
import {
  CANARY,
  app,
  buildApp,
  clientViolations,
  eagerGlob,
  emittedCanaries,
  exposing,
  importProtection,
  readTexts,
  staticImport,
  textFile,
  timeout,
  toText,
} from './asset-query-app'
import type { Files } from './asset-query-app'
import type { StartBundler } from '../../build-harness'

const secretsIn = (dir: string) => ({
  [`${dir}/s.server.ts`]: `export const s = '${CANARY}'\n`,
})
const plainGlob = (pattern: string) =>
  `const modules = import.meta.glob('${pattern}', { eager: true });\n${exposing('Object.values(modules).map(toText)')}`
const template = (prefix: string, suffix: string) =>
  `${toText}(globalThis as any).texts = async (name = 's') => [toText(await import(\`${prefix}\${name}${suffix}\`))]\n`

const expectMockedAndReported = async (
  bundler: StartBundler,
  entry: string,
  files: Files,
  options?: Record<string, unknown>,
) => {
  const result = await buildApp(bundler, entry, files, {
    ...importProtection,
    ...options,
  })
  expect(await emittedCanaries(result.client.outDir)).toEqual([])
  expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
}

const viteRows: Array<[string, string, Files, Record<string, unknown>?]> = [
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
    'a denied file `exclude` matches, plain glob',
    plainGlob('./gen/*.server.ts'),
    secretsIn('src/gen'),
    { exclude: ['src/gen/**'] },
  ],
  [
    'a denied JSON file, plain glob',
    plainGlob('./*.server.json'),
    { 'src/a.server.json': `{"a":"${CANARY}"}` },
  ],
  ['a denied text file, plain glob', plainGlob('./*.server.txt'), textFile],
  [
    'a denied YAML file, plain glob with a ?url',
    eagerGlob('./*.server.yaml', '?url'),
    { 'src/a.server.yaml': `a: ${CANARY}\n` },
  ],
]

const rsbuildRows: Array<[string, string, Files, Record<string, unknown>?]> = [
  [
    'a denied file outside the source directory, template ?raw',
    template('../lib/', '.server.ts?raw'),
    secretsIn('lib'),
  ],
  [
    'a denied file outside the source directory, plain template',
    template('../lib/', '.server.ts'),
    secretsIn('lib'),
  ],
  [
    'a denied file `exclude` matches, plain template',
    template('./gen/', '.server.ts'),
    secretsIn('src/gen'),
    { exclude: ['src/gen/**'] },
  ],
  [
    'a denied text file, new URL',
    exposing(`[new URL('./notes.server.txt', import.meta.url).href]`),
    textFile,
  ],
]

describe('vite', () => {
  test.each(viteRows)(
    'build: %s is mocked and reported',
    async (_name, entry, files, options) => {
      await expectMockedAndReported('vite', entry, files, options)
    },
    timeout,
  )

  test.each(viteRows)(
    'dev: %s is mocked and reported',
    async (_name, entry, files, options) => {
      const recorder = violationRecorder({ ...importProtection, ...options })
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

describe('rsbuild', () => {
  test.each(rsbuildRows)(
    'build: %s is mocked and reported',
    async (_name, entry, files, options) => {
      await expectMockedAndReported('rsbuild', entry, files, options)
    },
    timeout,
  )

  test.each(rsbuildRows)(
    'dev: %s is mocked and reported',
    async (_name, entry, files, options) => {
      const recorder = violationRecorder({ ...importProtection, ...options })
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

describe.each<[StartBundler, string, Files]>([
  ['vite', viteRows[3]![1], viteRows[3]![2]],
  ['vite', viteRows[1]![1], viteRows[1]![2]],
  ['rsbuild', rsbuildRows[3]![1], rsbuildRows[3]![2]],
  ['rsbuild', rsbuildRows[1]![1], rsbuildRows[1]![2]],
])('%s build verdicts', (bundler, entry, files) => {
  test(
    'the error behaviour fails the build naming the importer',
    async () => {
      const error = await rejection(
        buildApp(bundler, entry, files, { behavior: 'error' }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )

  test(
    'a veto gives the real file',
    async () => {
      const result = await buildApp(bundler, entry, files, {
        ...importProtection,
        onViolation: () => false,
      })
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    },
    timeout,
  )
})

describe.each<StartBundler>(['vite', 'rsbuild'])('%s build', (bundler) => {
  const lib = {
    ...secretsIn('lib'),
    'lib/a.ts': `import { s } from './s.server'
export const read = () => s
`,
  }
  const marked = (file: string) => ({
    [file]: `import '@tanstack/react-start/server-only'
export const s = '${CANARY}'
`,
  })

  test(
    'an importer outside the source directory gets the real module of a denied file outside it, unreported',
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
    'an importer in the scope next to it gets the mock and is reported; the other keeps the real module',
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
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    },
    timeout,
  )

  test.each(['src/ok.ts', 'lib/ok.ts'])(
    '`excludeFiles` gives the real module of the marked %s, unreported',
    async (file) => {
      const result = await buildApp(
        bundler,
        `import { s } from '${file.startsWith('src') ? './ok' : '../lib/ok'}'
;(globalThis as any).s = s
`,
        marked(file),
        { behavior: 'error', client: { excludeFiles: ['**/ok.ts'] } },
      )
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
    },
    timeout,
  )

  test(
    'a data file no rule denies keeps its text, unreported',
    async () => {
      const result = await buildApp(
        bundler,
        bundler === 'vite'
          ? plainGlob('./*.json')
          : exposing(`[new URL('./plain.txt', import.meta.url).href]`),
        { 'src/plain.json': `{"a":"${CANARY}"}`, 'src/plain.txt': CANARY },
      )
      expect(await emittedCanaries(result.client.outDir)).not.toEqual([])
      expect(clientViolations(result)).toBe(0)
    },
    timeout,
  )
})

test(
  "a dependency keeps its own file a rule denies: `excludeFiles: []` judges what an app's importers reach",
  async () => {
    const result = await buildApp(
      'vite',
      staticImport('dep'),
      {
        'node_modules/dep/package.json': `{"name":"dep","type":"module","exports":"./index.js"}`,
        'node_modules/dep/index.js': `export { s } from './own.server.js'\n`,
        'node_modules/dep/own.server.js': `export const s = '${CANARY}'\n`,
      },
      { ...importProtection, client: { excludeFiles: [] } },
    )
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

/** A plugin's own virtual assets: never files, and never judged by reading them back through the host. */
const virtualAssets = (id: string, code: string) => ({
  name: 'virtual-asset',
  resolveId: (source: string) => (source === id ? id : null),
  load: (loaded: string) => (loaded === id ? code : null),
})

describe.each([
  ['virtual:app.css', `.x{content:"${CANARY}"}`],
  ['virtual:app.json', `{"a":"${CANARY}"}`],
])('a virtual asset %s loads', (id, code) => {
  test(
    'in a build',
    async () => {
      const result = await buildStart({
        bundler: 'vite',
        files: app(staticImport(id), {}),
        entry: 'src/entry.ts',
        start: { importProtection },
        viteConfig: { plugins: [virtualAssets(id, code)] },
      })
      expect(clientViolations(result)).toBe(0)
    },
    timeout,
  )

  test(
    'on a dev server, the client first',
    async () => {
      const server = await startDevServer({
        browser: true,
        start: { importProtection },
        files: app(staticImport(id), {}),
        plugins: [virtualAssets(id, code)],
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        'return (await globalThis.texts()).length',
      )
      expect(result).toBe(1)
    },
    timeout,
  )
})
