/**
 * When the Vite host sets its client-build record (settlement design rev 4
 * step 7, the decided trigger): none when a build that writes or empties
 * its output directory starts rendering, the written output at
 * `writeBundle`, the output of a build that leaves the directory unchanged
 * (`write: false` without watch, or with `watch.skipWrite`) at
 * `generateBundle`, never a dev server's; and a separate provider's list
 * (RSC), which follows the provider's output the same way, from the
 * resolver module's `meta`. The watch rows (`build.write: false` with watch
 * writes): `tests/integration/start-build-settlement-record.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest'
import { START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'
import { providerListPlugin } from '../src/vite/server-fn-plugins'
import { resolvedVirtualId } from '../src/vite/createVirtualModule'
import type {
  ClientBuilds,
  ClientOutput,
  Session,
  ViteCompilerState,
} from '../src/vite/compiler-state'

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: {
    startManifest: 'tanstack-start-manifest:v',
    serverFnResolver: '#tanstack-start-server-fn-resolver',
  },
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

/** The record setter's calls (`none`, `output`), and the plugin's record hooks. */
function recordOf() {
  const calls: Array<'none' | 'output'> = []
  const clientBuilds = {
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

/** A client build's hook context. */
function context(
  mode: 'build' | 'dev',
  write: boolean,
  watch: null | { skipWrite?: boolean } = null,
) {
  return {
    environment: {
      name: START_ENVIRONMENT_NAMES.client,
      mode,
      config: { build: { write, watch } },
    },
    meta: { watchMode: watch !== null },
  }
}

/** One client build's output hooks, in Vite's order (`writes`: `writeBundle` runs). */
function build(plugin: any, ctx: ReturnType<typeof context>, writes: boolean) {
  plugin.renderStart.handler.call(ctx)
  plugin.generateBundle.handler.call(ctx, {}, bundle, writes)
  if (writes) {
    plugin.writeBundle.handler.call(ctx, {}, bundle)
  }
}

describe('the Vite client-build record', () => {
  test('a written build: none at renderStart, the output at writeBundle', () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('build', true), true)
    expect(calls).toEqual(['none', 'output'])
  })

  test('an in-memory build: the output at generateBundle, nothing withdrawn', () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('build', false), false)
    expect(calls).toEqual(['output'])
  })

  test('write: false in watch mode writes: as a written build', () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('build', false, {}), true)
    expect(calls).toEqual(['none', 'output'])
  })

  // `skipWrite` with `build.write` on: Vite empties the directory at
  // `renderStart` and nothing is written, so no client build is on disk.
  // Source: Astra's re-check of settlement step 7 (`skip-write-seeded.mjs`).
  test('watch.skipWrite with build.write on empties the directory: withdrawn, none committed', () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('build', true, { skipWrite: true }), false)
    expect(calls).toEqual(['none'])
  })

  test('watch.skipWrite with build.write: false leaves the directory unchanged: the output at generateBundle', () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('build', false, { skipWrite: true }), false)
    expect(calls).toEqual(['output'])
  })

  test("a dev server's bundled client: no record", () => {
    const { calls, plugin } = recordOf()
    build(plugin, context('dev', true), true)
    expect(calls).toEqual([])
  })
})

describe("a separate provider's list (RSC)", () => {
  /** The provider-list plugin over one session, and the resolver module's `meta` of the build running now. */
  function listOf() {
    const session = { providerListed: null } as unknown as Session
    const state = {
      ssrIsProvider: false,
      opts: { providerEnvName: 'rsc' },
      sessionOf: () => session,
    } as unknown as ViteCompilerState
    const plugin = providerListPlugin(state) as any
    const resolver = resolvedVirtualId('#tanstack-start-server-fn-resolver')
    let meta: Record<string, unknown> | null = null
    const ctx = (watch: boolean, write: boolean) => ({
      environment: {
        name: 'rsc',
        mode: 'build',
        config: { build: { write, watch: watch ? {} : null } },
      },
      meta: { watchMode: watch },
      getModuleInfo: (id: string) =>
        id === resolver && meta ? { meta } : null,
    })
    return {
      plugin,
      ctx,
      listed: () => session.providerListed && [...session.providerListed],
      /** The resolver module of the build running now lists `ids` (null: the build bundles none). */
      load: (ids: Array<string> | null) => {
        meta = ids && { 'tanstack-start:provider-list': ids }
      },
    }
  }

  // `write: false` in watch mode writes: the written build's list is the
  // provider's, so the caller's check of what the client calls stays on.
  // Source: Gemini's review of settlement step 7 (the resolver's `load`
  // read `build.write`).
  test('write: false in watch mode: the written build commits its list', () => {
    const { plugin, ctx, listed, load } = listOf()
    const c = ctx(true, false)
    plugin.renderStart.handler.call(c)
    load(['a', 'b'])
    plugin.generateBundle.handler.call(c)
    plugin.writeBundle.handler.call(c)
    expect(listed()).toEqual(['a', 'b'])
  })

  // A failed build's resolver listed ids; the next written build bundles no
  // resolver module: the list is none, not the failed build's.
  // Source: Gemini's review of settlement step 7 (`probe-review2.mjs`, 5b).
  test("a written build without the resolver module lists none, not a failed build's ids", () => {
    const { plugin, ctx, listed, load } = listOf()
    const c = ctx(true, true)
    plugin.renderStart.handler.call(c)
    load(['stale'])
    // (the build fails in its output phase: no writeBundle)
    plugin.renderStart.handler.call(c)
    load(null)
    plugin.writeBundle.handler.call(c)
    expect(listed()).toEqual(null)
  })
})
