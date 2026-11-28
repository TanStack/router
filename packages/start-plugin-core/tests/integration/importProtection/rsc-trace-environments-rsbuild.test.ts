/**
 * The trace `onViolation` receives in an Rsbuild RSC build where one file
 * is a module of several compile environments (the RSC layer and layers
 * of the user's), each resolving its imports its own way: every step is
 * a module of one environment, and the walk goes on through that module's
 * own importers (SPEC J6.5), so a trace is a chain the build has. A file
 * that is an entry in one environment is no entry of another.
 * Source: the RSC phase 1 re-check (/var/tmp/rsc-p1-recheck/report.md §3,
 * probes case-fork and case-entry: 407da6ddac and db260cf3a3 traced
 * `decoy.ts → Twin.ts → actual.ts` and started at `relay.ts (entry)`),
 * design-rsc-phase1-graph.md §5.4 R3.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rejection, violationsOf } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'

/** A server component `ucServer.tsx` rendering `detail()` of `./${dep}` and a client box, and route `/uc` rendering it. */
function app(dep: string, call: string): Record<string, string> {
  return {
    'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
    'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
    'src/utils/browser.client.ts': `export function clientLabel(): string {
  return 'client-only label'
}
`,
    'src/utils/ClientBox.tsx': `'use client'
export function ClientBox() {
  return <span data-testid="client-box">{'client-only label'}</span>
}
`,
    'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox'
import { ${call} } from './${dep}'
function ServerPart() {
  return (
    <section>
      <i>{${call}()}</i>
      <ClientBox />
    </section>
  )
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`,
    'src/routes/uc.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { ClientBox } from '../utils/ClientBox'
import { getUc } from '../utils/ucServer'
export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      <ClientBox />
      {Server}
    </main>
  )
}
`,
    'src/utils/safe.ts': `export const detail = () => 'SAFE'\n`,
    'src/utils/actual.ts': `import { clientLabel } from './browser.client'
export const detail = () => clientLabel()
`,
    'src/entry.ts': `export {}\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
  }
}

/** Rspack's `EntryPlugin` adding `file` as entry `name` in `layer` to the server compiler. */
const entryIn = (file: string, layer: string) => ({
  apply(compiler: {
    context: string
    rspack: {
      EntryPlugin: new (
        context: string,
        entry: string,
        options: { name: string; layer: string },
      ) => { apply: (compiler: unknown) => void }
    }
  }) {
    new compiler.rspack.EntryPlugin(compiler.context, file, {
      name: 'independent',
      layer,
    }).apply(compiler)
  },
})

const build = (options: {
  files: Record<string, string>
  imports: Record<string, string>
  rules: Array<Record<string, unknown>>
  entry: ReturnType<typeof entryIn>
}) =>
  buildStart({
    bundler: 'rsbuild',
    files: options.files,
    entry: 'src/entry.ts',
    packageJson: {
      name: 'app',
      private: true,
      type: 'module',
      sideEffects: false,
      imports: { '#impl': options.imports },
    },
    symlinks: rsbuildRscLinks(),
    rsbuildConfig: {
      environments: {
        ssr: {
          tools: {
            rspack: (config: {
              module: { rules?: Array<unknown> }
              plugins?: Array<unknown>
            }) => {
              ;(config.module.rules ??= []).push(...options.rules)
              ;(config.plugins ??= []).push(options.entry)
            },
          },
        },
      },
    } as never,
    start: {
      rsc: { enabled: true },
      importProtection: { behavior: 'error', exclude: ['**/uc.tsx'] },
    } as never,
  })

/** The files of a violation's trace, each once in a row (a module and its split modules). */
async function tracedFiles(
  built: Promise<unknown>,
): Promise<Array<Array<string>>> {
  const failed = await rejection(built as never)
  return violationsOf(failed)
    .filter((v) => v.specifier === './browser.client')
    .map((v) =>
      v.trace
        .map((step) => step.at.replace(/:.*/, ''))
        .filter((file, i, all) => all[i - 1] !== file),
    )
}

describe('Rsbuild RSC build, a file of several compile environments', () => {
  // decoy[reports] → Twin[reports] → safe; ucServer[rsc] → Twin[rsc] → actual[reports]
  test("a trace is the chain of the reported module's own environment", async () => {
    const traces = await tracedFiles(
      build({
        files: {
          ...app('Twin', 'read'),
          'src/utils/Twin.ts': `import { detail } from '#impl'
export const read = () => detail()
`,
          'src/utils/decoy.ts': `import { read } from './Twin'
;(globalThis as any).decoy = read()
`,
        },
        imports: {
          'react-server': './src/utils/actual.ts',
          default: './src/utils/safe.ts',
        },
        rules: [
          { test: /actual\.ts$/, layer: 'reports' },
          {
            test: /Twin\.ts$/,
            issuerLayer: 'reports',
            resolve: { conditionNames: ['node', 'default'] },
          },
        ],
        entry: entryIn('./src/utils/decoy.ts', 'reports'),
      }),
    )
    expect(traces).toHaveLength(1)
    expect(traces[0]).not.toContain('src/utils/decoy.ts')
    expect(traces[0]!.slice(-3)).toEqual([
      'src/utils/ucServer.tsx',
      'src/utils/Twin.ts',
      'src/utils/actual.ts',
    ])
  })

  // decoy[rsc] (an entry) → Twin[reports] → safe; ucServer[rsc] → Twin[rsc]
  // → actual[rsc]: the RSC layer's records have decoy's import of Twin.ts,
  // which the bundler resolved to the other layer's module.
  // Source: the RSC phase 1 re-check 2 (/var/tmp/rsc-p1-recheck2/report.md
  // §4, `adversarial.py trace`: 2f8afeccc0 and db260cf3a3 traced
  // `decoy.ts → Twin.ts → actual.ts`)
  test("a trace does not go through an import of the file that another layer's module of it has", async () => {
    const traces = await tracedFiles(
      build({
        files: {
          ...app('Twin', 'read'),
          'src/utils/Twin.ts': `import { detail } from '#impl'
export const read = () => detail()
`,
          'src/utils/decoy.ts': `import { read } from './Twin'
;(globalThis as any).decoy = read()
`,
        },
        imports: {
          'react-server': './src/utils/actual.ts',
          default: './src/utils/safe.ts',
        },
        rules: [
          {
            test: /Twin\.ts$/,
            issuer: /decoy\.ts$/,
            layer: 'reports',
            resolve: { conditionNames: ['node', 'default'] },
          },
          {
            test: /Twin\.ts$/,
            issuerLayer: 'reports',
            resolve: { conditionNames: ['node', 'default'] },
          },
        ],
        entry: entryIn('./src/utils/decoy.ts', 'react-server-components'),
      }),
    )
    expect(traces).toHaveLength(1)
    expect(traces[0]).not.toContain('src/utils/decoy.ts')
    expect(traces[0]!.slice(-3)).toEqual([
      'src/utils/ucServer.tsx',
      'src/utils/Twin.ts',
      'src/utils/actual.ts',
    ])
  })

  // relay[independent] is an entry resolving `#impl` to safe; relay[rsc] is
  // not, and resolves it to actual
  test("a file that is an entry of another environment is no entry of the reported module's", async () => {
    const traces = await tracedFiles(
      build({
        files: {
          ...app('relay', 'detail'),
          'src/utils/relay.ts': `import { detail } from '#impl'
export { detail }
;(globalThis as any).relayValue = detail()
`,
        },
        imports: {
          independent: './src/utils/safe.ts',
          default: './src/utils/actual.ts',
        },
        rules: [
          {
            test: /relay\.ts$/,
            issuerLayer: 'independent',
            resolve: { conditionNames: ['independent', '...'] },
          },
        ],
        entry: entryIn('./src/utils/relay.ts', 'independent'),
      }),
    )
    expect(traces).toHaveLength(1)
    expect(traces[0]![0]).not.toBe('src/utils/relay.ts')
    expect(traces[0]!.slice(-3)).toEqual([
      'src/utils/ucServer.tsx',
      'src/utils/relay.ts',
      'src/utils/actual.ts',
    ])
  })
})
