/**
 * Imports the bundler expands from a pattern are edges too (SPEC J6.1): an
 * `import.meta.glob` (eager and lazy) and a template-literal `import()` on
 * Vite, an `import.meta.webpackContext` and a template-literal `import()` on
 * Rsbuild, each matching only a `*.server.ts` file (the default client file
 * rule). The client never runs the denied file and each importer is
 * reported. Client environment, mock mode, builds and dev servers (Vite,
 * Vite's bundled dev, Rsbuild).
 */
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
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
import type { Recorded } from '../../importProtection/start-apps'

const timeout = 60_000
const compileTimeout = timeout

afterEach(() => {
  delete (globalThis as Record<string, unknown>).loaded
  delete (globalThis as Record<string, unknown>).uses
})

/** A denied module that records that it ran, then gives `value`. */
const recording = (name: string, value: string) =>
  `;((globalThis as any).loaded ??= []).push('${name}')
export const ${name} = () => '${value}'
`

const denied = {
  'src/globbed/eager.server.ts': recording('eager', 'MARK_EAGER'),
  'src/globbed/lazy.server.ts': recording('lazy', 'MARK_LAZY'),
  'src/dyn/template.server.ts': recording('template', 'MARK_TEMPLATE'),
}

/** A value as text; a mock (a callable, thenable proxy) is never awaited. */
const text = `const text = (value: unknown) =>
  typeof value === 'string' ? value : typeof value
`

const template = `${text}export default (name = 'template') =>
  import(\`../dyn/\${name}.server.ts\`).then((m) => [text(m.template())])
`

const appOf = (uses: Record<string, string>) => ({
  ...denied,
  ...Object.fromEntries(
    Object.entries(uses).map(([name, code]) => [`src/uses/${name}.ts`, code]),
  ),
  'src/entry.ts': `${Object.keys(uses)
    .map((name) => `import ${name} from './uses/${name}'`)
    .join('\n')}
;(globalThis as any).uses = { ${Object.keys(uses).join(', ')} }
`,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
})

const viteApp = appOf({
  eager: `${text}const modules = import.meta.glob('../globbed/eager*.ts', { eager: true })
export default () => Object.values(modules).map((m: any) => text(m.eager()))
`,
  lazy: `${text}const modules = import.meta.glob('../globbed/lazy*.ts')
export default () =>
  Promise.all(
    Object.values(modules).map((load) => load().then((m: any) => text(m.lazy()))),
  )
`,
  template,
})

const rsbuildApp = appOf({
  eager: `${text}const context = import.meta.webpackContext('../globbed', { recursive: false, regExp: /eager[^/]*\\.ts$/ })
export default () => context.keys().map((key) => text(context(key).eager()))
`,
  template,
})

/** Calls every use; the values (or `throws`) and the denied modules that ran. */
const readScript = `const values = {}
for (const [name, use] of Object.entries(globalThis.uses)) {
  try {
    values[name] = String(await use())
  } catch {
    values[name] = 'throws'
  }
}
return { values, loaded: globalThis.loaded ?? [] }`

interface Read {
  values: Record<string, string>
  loaded: Array<string>
}

interface Outcome {
  /** The uses whose denied module ran or gave its value in the client. */
  leaked: Array<string>
  /** The reported client importers. */
  reported: Array<string>
}

function outcome(read: Read, recorded: Recorded): Outcome {
  return {
    leaked: Object.entries(read.values)
      .filter(
        ([name, value]) =>
          read.loaded.includes(name) || value.includes('MARK_'),
      )
      .map(([name]) => name),
    reported: importersIn(recorded, 'client'),
  }
}

const importProtection = { behavior: 'mock', mockAccess: 'off' } as const

async function viteBuild(): Promise<Outcome> {
  const build = await buildStart({
    bundler: 'vite',
    files: viteApp,
    entry: 'src/entry.ts',
    start: { importProtection },
  })
  const { result } = await build.client.run(readScript)
  return outcome(result as Read, build)
}

async function viteDev(): Promise<Outcome> {
  const recorder = violationRecorder({ mockAccess: 'off' })
  const server = await startDevServer({
    browser: true,
    start: { importProtection: recorder.importProtection },
    files: viteApp,
  })
  const { result } = await runViteClient(server, '/src/router.ts', readScript)
  await server.idle()
  return outcome(result as Read, { root: server.root, ...recorder })
}

/** Full-bundle dev: a use leaked when the client bundle holds its denied module's code. */
async function viteBundledDev(): Promise<Outcome> {
  const server = await startProtectedDevServer(
    viteApp,
    { mockAccess: 'off' },
    { router: 'src/router.ts', bundledDev: { entry: 'src/router.ts' } },
  )
  const bundle = Object.values(await server.clientBundle()).join('\n')
  return {
    leaked: ['eager', 'lazy', 'template'].filter((name) =>
      bundle.includes(`MARK_${name.toUpperCase()}`),
    ),
    reported: importersIn(server, 'client'),
  }
}

async function rsbuildBuild(): Promise<Outcome> {
  const build = await buildStart({
    bundler: 'rsbuild',
    files: rsbuildApp,
    entry: 'src/entry.ts',
    start: { importProtection },
  })
  const { result } = await build.client.run(readScript)
  return outcome(result as Read, build)
}

async function rsbuildDev(): Promise<Outcome> {
  const recorder = violationRecorder({ mockAccess: 'off' })
  const server = await startRsbuildStartDevServer({
    compileTimeout,
    browser: true,
    hmr: false,
    files: rsbuildApp,
    start: { importProtection: recorder.importProtection },
  })
  const { result } = await captureConsole(() => runInClient(server, readScript))
  return outcome((result as { result: Read }).result, {
    root: server.root,
    ...recorder,
  })
}

const hosts = [
  { name: 'vite build', run: viteBuild, uses: ['eager', 'lazy', 'template'] },
  { name: 'vite dev', run: viteDev, uses: ['eager', 'lazy', 'template'] },
  {
    name: 'vite bundledDev',
    run: viteBundledDev,
    uses: ['eager', 'lazy', 'template'],
  },
  { name: 'rsbuild build', run: rsbuildBuild, uses: ['eager', 'template'] },
  { name: 'rsbuild dev', run: rsbuildDev, uses: ['eager', 'template'] },
]

describe.each(hosts)('$name', ({ run, uses }) => {
  let ran: Promise<Outcome> | undefined
  const result = () => (ran ??= run())

  // Regression (main mocks every one): the compile judges only the imports it
  // reads, before the bundler expands the pattern; nothing judges the expanded ones.
  test.fails(
    'the client never runs a denied module',
    async () => {
      expect((await result()).leaked).toEqual([])
    },
    timeout,
  )

  // Main reports these in vite build only (its dev hosts and Rsbuild mock them silently).
  test.fails(
    'each importer is reported',
    async () => {
      expect((await result()).reported).toEqual(
        uses.map((name) => `src/uses/${name}.ts`),
      )
    },
    timeout,
  )
})
