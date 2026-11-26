/**
 * When the Vite host sets its client-build record (settlement design rev 4
 * step 7, the decided trigger): none when a written build starts rendering,
 * the written output at `writeBundle`, an in-memory build's (`write: false`,
 * no watch) at `generateBundle`, and never a plugin-rsc scan's (an RSC run's
 * in-memory builds are no client build) nor a dev server's. The watch rows
 * (`build.write: false` with watch writes): `tests/integration/
 * start-build-settlement-record.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest'
import { START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'
import type { ClientBuilds, ClientOutput } from '../src/vite/compiler-state'

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: { startManifest: 'tanstack-start-manifest:v' },
}))

const bundle = {
  'entry.js': {
    type: 'chunk',
    fileName: 'entry.js',
    code: 'export {}',
    isEntry: true,
    imports: [],
    dynamicImports: [],
    moduleIds: [],
    viteMetadata: { importedCss: new Set<string>() },
  },
}

/** The record setter's calls (`null`: none), and the plugin's record hooks. */
function recordOf(rsc: boolean) {
  const calls: Array<'none' | 'output'> = []
  const clientBuilds = {
    rsc,
    setClientBuild: (_environment: unknown, output: ClientOutput | null) => {
      calls.push(output ? 'output' : 'none')
    },
    embedClientBuild: () => Promise.resolve(null),
  } as unknown as ClientBuilds
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        startConfig: { server: { build: { inlineCss: { enabled: false } } } },
      }) as any,
    clientBuilds,
  }) as Array<any>
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-client-build',
  )!
  return { calls, plugin }
}

const context = (mode: 'build' | 'dev', write: boolean, watchMode = false) => ({
  environment: {
    name: START_ENVIRONMENT_NAMES.client,
    mode,
    config: { build: { write } },
  },
  meta: { watchMode },
})

/** One client build's output hooks, in Vite's order; `isWrite` as Vite passes it. */
function build(plugin: any, ctx: ReturnType<typeof context>, isWrite: boolean) {
  plugin.renderStart.handler.call(ctx)
  plugin.generateBundle.handler.call(ctx, {}, bundle, isWrite)
  if (isWrite) {
    plugin.writeBundle.handler.call(ctx, {}, bundle)
  }
}

describe('the Vite client-build record', () => {
  test('a written build: none at renderStart, the output at writeBundle', () => {
    const { calls, plugin } = recordOf(false)
    build(plugin, context('build', true), true)
    expect(calls).toEqual(['none', 'output'])
  })

  test('an in-memory build: the output at generateBundle, nothing withdrawn', () => {
    const { calls, plugin } = recordOf(false)
    build(plugin, context('build', false), false)
    expect(calls).toEqual(['output'])
  })

  test('write: false in watch mode writes: as a written build', () => {
    const { calls, plugin } = recordOf(false)
    build(plugin, context('build', false, true), true)
    expect(calls).toEqual(['none', 'output'])
  })

  test("an RSC run's in-memory build (a plugin-rsc scan): no record", () => {
    const { calls, plugin } = recordOf(true)
    build(plugin, context('build', false), false)
    expect(calls).toEqual([])
  })

  test("a dev server's bundled client: no record", () => {
    const { calls, plugin } = recordOf(false)
    build(plugin, context('dev', true), true)
    expect(calls).toEqual([])
  })
})
