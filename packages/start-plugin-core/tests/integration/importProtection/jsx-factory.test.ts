/**
 * An import a module reads only as the JSX factory (a classic-runtime pragma)
 * is an import edge of the module like any other (SPEC J6.1, J6.4): on dev
 * servers (client, mock mode, Vite and Rsbuild) the import of a denied file
 * is reported and the client never loads the file. Alike for a module the
 * compiler only reads the imports of and one whose Start code it rewrites (a
 * server fn).
 */
import {
  captureConsole,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './hosts'

const compileTimeout = 60_000

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
  test('an import read only as the JSX factory is reported when the JSX transform keeps it', async () => {
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
  })
})

describe('rsbuild dev', () => {
  test('an import read only as the JSX factory is reported when the JSX transform keeps it', async () => {
    const recorder = violationRecorder({ mockAccess: 'off' })
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      browser: true,
      hmr: false,
      files: app,
      start: { importProtection: recorder.importProtection },
    })
    expectNoDiagnostic(server.diagnostics, { severity: 'error' })
    const { result } = await captureConsole(() =>
      runInClient(server, 'return globalThis.factoryLoaded ?? null'),
    )
    expect({
      factoryLoaded: (result as { result: unknown }).result,
      reported: importersIn({ root: server.root, ...recorder }, 'client'),
    }).toEqual(expected)
  })
})
