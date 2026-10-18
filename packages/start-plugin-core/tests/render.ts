/**
 * `<Hydrate>` modules compiled by the Start compiler and its Hydrate plugin,
 * then evaluated and rendered in this process with the real packages: React
 * and `react-dom`, the real `@tanstack/react-router` (its
 * `lazyRouteComponent`, `ClientOnly`) and Start's real `Hydrate` and
 * hydration strategies (`@tanstack/react-start-client`, which
 * `@tanstack/react-start` re-exports). Re-exported by `regression-helpers.ts`.
 *
 * - `compileHydrate(env, code)`: the compiled parent module and the chunks it
 *   imports, as the plugin serves them (the host contract of the plugin).
 * - `renderSource`, `renderServer`, `renderClient`: the uncompiled source,
 *   the server output and the client output (its chunks loaded through the
 *   parent's own dynamic imports, each compiled like the bundler compiles the
 *   virtual module) rendered to HTML by `react-dom/static`, which waits for
 *   lazy components and Suspense like a streaming server render does. A
 *   render error (React's `onError`) fails the render.
 * - `expectClientRendersLikeServer`: the client output renders the markup
 *   the server output renders (boundary markers and ids included) and loads
 *   split code while it renders.
 *
 * Rendering the client output here runs it outside a browser: the real
 * `Hydrate` takes its server path (no gate, children rendered), which is
 * what the markup comparison needs. Hydration itself, effects, `prefetch`,
 * `onHydrated` and events need a page: `integration/hydrate-pages.ts`.
 *
 * Solid: `@tanstack/solid-router` cannot be linked in process (its build
 * calls client-only Solid APIs under Node; see router-plugin's
 * `lazy-tracking.ts`), so Solid modules are only compiled here.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { workspacePackage } from '@tanstack/compiler-test-utils/workspace-packages'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { moduleRequests } from './imports'
import {
  createStartCompiler,
  createTestModuleGraph,
  moduleId,
} from './regression-helpers'
import type {
  ModuleGraph,
  ModuleStub,
} from '@tanstack/compiler-test-utils/module-linker'
import type { StartCompilerTransformResult } from '../src/types'
import type { Framework } from './regression-helpers'

type HydratePlugin = ReturnType<typeof createHydrateCompilerPlugin>

/** Where the real packages of an in-process graph resolve from. */
export const packagesDir = path.dirname(fileURLToPath(import.meta.url))

/** Ids of the virtual modules the Hydrate plugin serves (its host contract). */
const hydrateVirtualModuleIds =
  createHydrateCompilerPlugin().virtualModuleIdPattern!

/**
 * The `<Hydrate>` chunk ids a compiled module imports, in source order: the
 * modules it imports dynamically that the Hydrate plugin serves.
 */
export function getChunkIds(code: string) {
  return moduleRequests(code).dynamic.filter((id) => {
    hydrateVirtualModuleIds.lastIndex = 0
    return hydrateVirtualModuleIds.test(id)
  })
}

/**
 * Loads a `<Hydrate>` chunk the way the bundler loads the virtual module
 * (`code`: the source module's code, as Rsbuild passes it).
 */
export function loadChunk(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
  code?: string,
) {
  return loadChunkResult(plugin, env, id, code)?.code ?? null
}

function loadChunkResult(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
  code?: string,
): StartCompilerTransformResult | null {
  return (
    plugin.loadVirtualModule?.({
      id,
      code,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    }) ?? null
  )
}

/**
 * Compiles a module with `<Hydrate>` for `env` and loads the split chunks it
 * imports (`chunks`, as the plugin serves them, before the bundler compiles
 * them; their ids in `chunkIds`, in import order). A module the compiler
 * leaves untouched is its own parent, without chunks.
 */
export async function compileHydrate(
  env: 'client' | 'server',
  code: string,
  options: { id?: string; framework?: Framework } = {},
) {
  const plugin = createHydrateCompilerPlugin()
  const { compile } = createStartCompiler({
    env,
    compilerPlugins: [plugin],
    framework: options.framework,
  })
  const parent = (await compile(code, options.id)) ?? code
  const chunkIds = getChunkIds(parent)
  const chunks = chunkIds.map((id) => {
    const chunk = loadChunk(plugin, env, id)
    if (chunk === null) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return chunk
  })
  return { parent, chunks, chunkIds, plugin }
}

/**
 * Loads the first chunk a parent module imports and compiles it for the
 * client under its virtual module id, like the bundler does.
 */
export async function compileFirstChunk(plugin: HydratePlugin, parent: string) {
  const id = getChunkIds(parent)[0]!
  const { compile, serverFns } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const code = await compile(loadChunk(plugin, 'client', id)!, id)
  return { code, serverFns }
}

/**
 * The built `@tanstack/react-start-client`, whose `Hydrate` and hydration
 * strategies `@tanstack/react-start` re-exports (this package's `test:unit`
 * depends on its `build`).
 */
const reactStartClient = workspacePackage('@tanstack/react-start-client')
const importer = createModuleGraph({ packages: packagesDir })

let startPackages: Promise<Record<string, ModuleStub>> | undefined

/**
 * `@tanstack/react-start` and `@tanstack/react-start/hydration` as the
 * package exports them: Start's runtime (`./start-runtime`, which every test
 * graph links) with the real `Hydrate` of `@tanstack/react-start-client`, and
 * its real hydration strategies.
 */
function reactStartPackages() {
  startPackages ??= (async () => {
    const [{ Hydrate }, hydration, { startClientCore }] = await Promise.all([
      importer.importPackage(
        path.join(reactStartClient, 'dist/esm/Hydrate.js'),
      ),
      importer.importPackage(
        path.join(reactStartClient, 'dist/esm/hydration.js'),
      ),
      import('./start-runtime'),
    ])
    return {
      '@tanstack/react-start': { ...startClientCore, Hydrate },
      '@tanstack/react-start/hydration': { ...hydration },
    }
  })()
  return startPackages
}

/**
 * The module the test graphs link for a `@tanstack/react-start` specifier
 * (`@tanstack/react-start`, `@tanstack/react-start/hydration`): e.g. a real
 * hydration strategy for a global the page reads.
 */
export async function startPackage(specifier: string) {
  return (await reactStartPackages())[specifier] as Record<string, any>
}

/** What a test renders: React nodes made with `h` (React's `createElement`). */
export type Render = (
  module: Record<string, any>,
  h: (type: any, props?: any, ...children: Array<any>) => unknown,
) => unknown

export interface RenderOptions {
  /** What to render; default `<Page {...props} />`. */
  render?: Render
  /** Props of the default render. */
  props?: Record<string, unknown>
  /** Id the module is compiled under (default `/test/src/module.tsx`). */
  id?: string
  /**
   * Project modules the module imports, by relative specifier from
   * `/test/src` (`'./widgets'`, a `.tsx` module) or absolute id, linked as
   * they are (TypeScript and JSX erased like any module).
   */
  files?: Record<string, string>
  /** Modules by specifier, linked over the real packages. */
  stubs?: Record<string, ModuleStub>
  /** Runs app code once the module evaluated, before it renders. */
  beforeRender?: (module: Record<string, any>) => unknown
}

const projectId = (specifier: string) =>
  specifier.startsWith('./')
    ? `/test/src/${specifier.slice(2)}${/\.[cm]?[jt]sx?$/.test(specifier) ? '' : '.tsx'}`
    : specifier

const projectFiles = (files: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(files).map(([specifier, code]) => [
      projectId(specifier),
      code,
    ]),
  )

/** A graph of the module `id` (`code`) linked to the real packages. */
async function realGraph(
  id: string,
  code: string,
  options: Pick<RenderOptions, 'files' | 'stubs'> & {
    load?: (id: string) => Promise<string | null>
    env: 'client' | 'server'
  },
) {
  return createTestModuleGraph({
    modules: { ...projectFiles(options.files), [id]: code },
    stubs: { ...(await reactStartPackages()), ...options.stubs },
    packages: packagesDir,
    env: options.env,
    load: options.load,
  })
}

/**
 * Renders what `options.render` returns with the graph's React to HTML
 * (`react-dom/static`), once every lazy component and Suspense boundary
 * resolved. An error React reports while rendering fails the render.
 */
export async function renderGraph(
  graph: ModuleGraph,
  module: Record<string, any>,
  options: Pick<RenderOptions, 'render' | 'props'> = {},
): Promise<string> {
  const [React, { prerenderToNodeStream }] = await Promise.all([
    graph.importPackage('react'),
    graph.importPackage('react-dom/static'),
  ])
  const render: Render =
    options.render ?? ((m, h) => h(m.Page, options.props ?? {}))
  // Rendered inside a component: hooks a test's render calls run in it.
  const Root = () => render(module, React.createElement)
  const errors: Array<unknown> = []
  const { prelude } = await prerenderToNodeStream(React.createElement(Root), {
    onError: (error: unknown) => {
      errors.push(error)
    },
  })
  let html = ''
  for await (const part of prelude) {
    html += String(part)
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `rendering failed: ${errors.map((error) => (error instanceof Error ? error.message : String(error))).join('; ')}`,
    )
  }
  return html
}

/**
 * Renders the uncompiled `code` (the reference: `<Hydrate>` renders its
 * children in place).
 */
export async function renderSource(code: string, options: RenderOptions = {}) {
  const id = options.id ?? moduleId
  const graph = await realGraph(id, code, { ...options, env: 'client' })
  const module = await graph.import(id)
  await options.beforeRender?.(module)
  return { html: await renderGraph(graph, module, options), module, graph }
}

/** Compiles `code` for the server and renders the result. */
export async function renderServer(code: string, options: RenderOptions = {}) {
  const id = options.id ?? moduleId
  const { parent } = await compileHydrate('server', code, { id })
  expect(await getModuleErrors(parent, undefined, { source: code })).toEqual([])
  const graph = await realGraph(id, parent, { ...options, env: 'server' })
  const module = await graph.import(id)
  await options.beforeRender?.(module)
  return {
    html: await renderGraph(graph, module, options),
    module,
    parent,
    graph,
  }
}

export interface ClientOptions extends RenderOptions {
  /**
   * The chunks load the way Rsbuild loads them: given the source file's
   * code, from a Hydrate plugin that did not compile the parent (e.g.
   * another build worker).
   */
  chunksFromSource?: boolean
  /** An already compiled client parent and the plugin that compiled it. */
  compiled?: { parent: string; plugin: HydratePlugin }
  /** Source of a chunk, instead of the plugin's (e.g. an edited source). */
  loadChunk?: (chunkId: string) => string | null
}

/**
 * Compiles `code` for the client (unless `compiled` is given) and evaluates
 * it like the browser does: the parent module and, when they are imported,
 * its chunks (each compiled for the client under its virtual module id,
 * like the bundler compiles it) form one linked graph. Every emitted module
 * is checked to be valid (`getModuleErrors`, with the source as the
 * evidence of its bindings). `requestedAtLoad` lists what evaluating the
 * parent requested (graph module ids, stub and package specifiers);
 * `loadedChunks` the ids of the chunk modules the graph fetched and
 * compiled so far (the linker fetches the targets of dynamic imports
 * ahead of their evaluation, so this says which chunks exist, not which
 * ones a render needed: that is `renderClient`'s `lazy`).
 */
export async function loadClient(code: string, options: ClientOptions = {}) {
  const id = options.id ?? moduleId
  const { parent, plugin } =
    options.compiled ?? (await compileHydrate('client', code, { id }))
  expect(await getModuleErrors(parent, undefined, { source: code })).toEqual([])
  const chunkPlugin = options.chunksFromSource
    ? createHydrateCompilerPlugin()
    : plugin
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [chunkPlugin],
  })
  const loadedChunks: Array<string> = []
  const graph = await realGraph(id, parent, {
    ...options,
    env: 'client',
    // The bundler compiles each virtual module it loads like any other module.
    load: async (chunkId) => {
      // The linker also probes ids with extensions appended, which are no
      // modules of this graph.
      if (chunkId.split('?')[0] !== id.split('?')[0]) {
        return null
      }
      const chunk = options.loadChunk
        ? options.loadChunk(chunkId)
        : loadChunk(
            chunkPlugin,
            'client',
            chunkId,
            options.chunksFromSource ? code : undefined,
          )
      if (chunk === null) {
        return null
      }
      loadedChunks.push(chunkId)
      const compiled = (await compile(chunk, chunkId)) ?? chunk
      expect(
        await getModuleErrors(compiled, undefined, { source: code }),
        chunkId,
      ).toEqual([])
      return compiled
    },
  })
  const module = await graph.import(id)
  return {
    module,
    graph,
    parent,
    plugin,
    chunkIds: getChunkIds(parent),
    requestedAtLoad: [...graph.requested],
    loadedChunks,
  }
}

/**
 * `loadClient`, then renders the client module (`renderGraph`). `lazy` lists
 * the graph modules the render requested that loading the parent did not:
 * the split code the render loaded on demand.
 */
export async function renderClient(code: string, options: ClientOptions = {}) {
  const loaded = await loadClient(code, options)
  await options.beforeRender?.(loaded.module)
  const html = await renderGraph(loaded.graph, loaded.module, options)
  const lazy = loaded.graph.requested.filter(
    (requested) =>
      !loaded.requestedAtLoad.includes(requested) &&
      loaded.graph.has(requested),
  )
  return { ...loaded, html, lazy }
}

/** The render loaded split code on demand (`renderClient`'s `lazy`). */
export function expectRenderedThroughChunks(rendered: { lazy: Array<string> }) {
  expect(rendered.lazy).not.toEqual([])
}

/**
 * The client output renders the markup the server output renders (the
 * boundary markers and hydration ids of the real `Hydrate` included, so
 * the client would hydrate the server's HTML), and loaded split code while
 * rendering (unless `split: false`). Returns both renders.
 */
export async function expectClientRendersLikeServer(
  code: string,
  options: ClientOptions & { split?: boolean } = {},
) {
  const server = await renderServer(code, options)
  const client = await renderClient(code, options)
  expect(client.html).toBe(server.html)
  if (options.split !== false) {
    expectRenderedThroughChunks(client)
  }
  return { server, client }
}

/**
 * `html` with the value of every hydration id Start's `Hydrate` renders
 * (`data-ts-hydrate-id`) blanked: what is left is the markup the uncompiled
 * source must render too. The id may carry a compiler-assigned part that
 * the source has not (SPEC J5.4, §5.17); the server and client renders are
 * compared with their ids.
 */
export function withoutHydrationIds(html: string) {
  return html.replace(/ data-ts-hydrate-id="[^"]*"/g, ' data-ts-hydrate-id=""')
}

/**
 * The uncompiled source, the server output and the client output render
 * the same markup (`expectClientRendersLikeServer`; the source's markup
 * compared without hydration ids, `withoutHydrationIds`), and the client
 * loaded split code while rendering (unless `split: false`).
 */
export async function expectRendersLikeSource(
  code: string,
  options: ClientOptions & { split?: boolean } = {},
) {
  const source = await renderSource(code, options)
  const rendered = await expectClientRendersLikeServer(code, options)
  expect(withoutHydrationIds(rendered.server.html)).toBe(
    withoutHydrationIds(source.html),
  )
  return { source, ...rendered }
}
