/**
 * An import a module reads only as the JSX factory is an edge that reads
 * that binding (SPEC J6.1, J6.4): every element calls the factory under a
 * classic-runtime pragma, and the bundlers' TypeScript transforms keep a
 * default `React` import in a module with JSX whatever the runtime. On dev
 * servers (client, mock mode, Vite and Rsbuild) the import of a denied file
 * is reported and the client never loads the file; in an Rsbuild build whose
 * `source.transformImport` rewrites the library the factory comes from, the
 * file rule judges the submodule the factory's import is rewritten to.
 * Alike for a module the compiler only reads the imports of and one whose
 * Start code it rewrites (a server fn).
 */
import {
  captureConsole,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  rejection,
  reportedViolations,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './v2-hosts'

const timeout = 60_000
const compileTimeout = timeout

afterEach(() => {
  delete (globalThis as Record<string, unknown>).factoryLoaded
})

const serverFn = (
  name: string,
) => `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => 'pong')
`
const classic = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from '../jsx.server'
`

const app = {
  'src/jsx.server.ts': `;(globalThis as any).factoryLoaded = 'MARK_FACTORY_LOADED'
export const h = (..._args: Array<unknown>) => null
export default { createElement: h, Fragment: 'fragment' }
`,
  'src/forms/automatic.tsx': `import React from '../jsx.server'
export const Automatic = () => <p>automatic</p>
`,
  'src/forms/automatic-start.tsx': `import React from '../jsx.server'
${serverFn('pingAutomatic')}export const AutomaticStart = () => <p>automatic</p>
`,
  'src/forms/classic.tsx': `${classic}export const Classic = () => <p>classic</p>
`,
  'src/forms/classic-start.tsx': `${classic}${serverFn('pingClassic')}export const ClassicStart = () => <p>classic</p>
`,
  'src/entry.ts': `export * from './forms/automatic'
export * from './forms/automatic-start'
export * from './forms/classic'
export * from './forms/classic-start'
`,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}

const expected = {
  factoryLoaded: null,
  reported: [
    'src/forms/automatic-start.tsx',
    'src/forms/automatic.tsx',
    'src/forms/classic-start.tsx',
    'src/forms/classic.tsx',
  ],
}

describe('vite dev', () => {
  test(
    'an import read only as the JSX factory is reported when the JSX transform keeps it',
    async () => {
      const recorder = violationRecorder({ mockAccess: 'off' })
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: app,
      })
      const { result } = await runViteClient(
        server,
        '/src/router.ts',
        'return globalThis.factoryLoaded ?? null',
      )
      await server.idle()
      expect({
        factoryLoaded: result,
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'an import read only as the JSX factory is reported when the JSX transform keeps it',
    async () => {
      const recorder = violationRecorder({ mockAccess: 'off' })
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        browser: true,
        hmr: false,
        files: app,
        start: { importProtection: recorder.importProtection },
      })
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }),
      ).toEqual([])
      const { result } = await captureConsole(() =>
        runInClient(server, 'return globalThis.factoryLoaded ?? null'),
      )
      expect({
        factoryLoaded: (result as { result: unknown }).result,
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
      }).toEqual(expected)
    },
    timeout,
  )
})

describe('rsbuild build, source.transformImport', () => {
  const fromLib = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from 'ui-lib'
`
  test(
    'a JSX factory of a rewritten library is judged at its submodule: the build fails, naming each importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler: 'rsbuild',
          files: {
            'node_modules/ui-lib/package.json': JSON.stringify({
              name: 'ui-lib',
              type: 'module',
              exports: { '.': './index.js', './*': './*.js' },
            }),
            'node_modules/ui-lib/index.js': `export { h } from './h.js'\n`,
            'node_modules/ui-lib/h.js': `export const h = () => 'MARK_SECRET'\n`,
            'src/forms/plain.tsx': `${fromLib}export const Plain = () => <p>plain</p>\n`,
            'src/forms/start.tsx': `${fromLib}${serverFn('pingLib')}export const Start = () => <p>start</p>\n`,
            'src/entry.ts': `export { Plain } from './forms/plain'
export { Start } from './forms/start'
`,
          },
          entry: 'src/entry.ts',
          // `excludeFiles: []`: the checks see dependencies (J6.10)
          start: {
            importProtection: {
              client: { files: ['**/ui-lib/h.js'], excludeFiles: [] },
            },
          },
          rsbuildConfig: {
            source: {
              transformImport: [
                {
                  libraryName: 'ui-lib',
                  customName: 'ui-lib/{{ member }}',
                  transformToDefaultImport: false,
                },
              ],
            },
          },
        }),
      )
      expect(
        reportedViolations(error)
          .map((v) => `${v.environment} ${v.importer.split(':')[0]}`)
          .sort(),
      ).toEqual(['client src/forms/plain.tsx', 'client src/forms/start.tsx'])
    },
    timeout,
  )
})
