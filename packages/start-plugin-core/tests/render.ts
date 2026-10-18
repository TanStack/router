/**
 * Splits `<Hydrate>` children into chunks with the Start compiler and the
 * hydrate plugin, loads and renders the chunks, and renders a page's
 * boundaries through them. Re-exported by `regression-helpers.ts`.
 */
import { expect } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'
import type { StartCompilerTransformResult } from '../src/types'
import {
  isNode,
  moduleRequests,
  parseModule,
  staticSpecifier,
  walk,
} from './imports'
import type { Node } from './imports'
import {
  createStartCompiler,
  createTestModuleGraph,
  evaluateModule,
  moduleId,
} from './regression-helpers'
import type { Framework } from './regression-helpers'
import { chunkBoundaryStart } from './source-maps'

type HydratePlugin = ReturnType<typeof createHydrateCompilerPlugin>

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

/** The name of a JSX element, as written (`Hydrate`, `Start.Hydrate`). */
function jsxElementName(name: unknown): string | undefined {
  if (!isNode(name)) {
    return undefined
  }
  if (name.type === 'JSXIdentifier') {
    return name.name as string
  }
  if (name.type === 'JSXMemberExpression') {
    const object = jsxElementName(name.object)
    return object === undefined
      ? undefined
      : `${object}.${(name.property as Node).name as string}`
  }
  return undefined
}

/**
 * The JSX element names that refer to the `Hydrate` component of a
 * `@tanstack/*-start` package in a module: its named imports and the
 * `Hydrate` member of its namespace imports.
 */
function hydrateElementNames(program: unknown) {
  const names = new Set<string>()
  walk(program, (node) => {
    if (
      node.type !== 'ImportDeclaration' ||
      !/^@tanstack\/[\w-]+-start$/.test(staticSpecifier(node.source) ?? '')
    ) {
      return
    }
    for (const specifier of node.specifiers as Array<Node>) {
      const local = (specifier.local as Node).name as string
      if (specifier.type === 'ImportNamespaceSpecifier') {
        names.add(`${local}.Hydrate`)
      } else if (
        specifier.type === 'ImportSpecifier' &&
        ((specifier.imported as Node).name ??
          (specifier.imported as Node).value) === 'Hydrate'
      ) {
        names.add(local)
      }
    }
  })
  return names
}

/** The `<Hydrate>` elements of a module, in source order. */
function hydrateElements(code: string) {
  const program = parseModule(code)
  const names = hydrateElementNames(program)
  const elements: Array<Node> = []
  walk(program, (node) => {
    if (
      node.type === 'JSXElement' &&
      names.has(jsxElementName((node.openingElement as Node).name) ?? '')
    ) {
      elements.push(node)
    }
  })
  return elements
}

/** Loads a `<Hydrate>` chunk the way the bundler loads the virtual module. */
export function loadChunk(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
) {
  return loadChunkResult(plugin, env, id)?.code ?? null
}

function loadChunkResult(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
): StartCompilerTransformResult | null {
  return (
    plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    }) ?? null
  )
}

/**
 * Compiles a module with `<Hydrate>` and loads the split chunks it imports
 * (`chunks`, as the plugin serves them, before the bundler compiles them; ids
 * in `chunkIds`), ordered like their boundaries in the source module (found
 * through each chunk's source map). A module the compiler leaves untouched is
 * its own parent, without chunks.
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
  const loaded = getChunkIds(parent).map((id) => {
    const chunk = loadChunkResult(plugin, env, id)
    if (chunk === null) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return { id, chunk }
  })
  // Only the outermost boundaries: a chunk maps to the boundary whose children
  // it renders, not to a boundary nested in them.
  const boundaries = hydrateElements(code)
    .map((element) => ({
      start: element.start as number,
      end: element.end as number,
    }))
    .filter(
      (range, _, ranges) =>
        !ranges.some(
          (other) =>
            other !== range &&
            other.start <= range.start &&
            range.end <= other.end,
        ),
    )
  const ordered = loaded
    .map(({ id, chunk }) => ({
      id,
      chunk,
      start: chunkBoundaryStart(chunk, code, boundaries),
    }))
    .sort((a, b) => a.start - b.start)
  return {
    parent,
    chunks: ordered.map(({ chunk }) => chunk.code),
    chunkIds: ordered.map(({ id }) => id),
    plugin,
  }
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
 * The export of the chunk `chunkId` that the client `parent` renders: the
 * name it gives `lazyRouteComponent(load, name)` (default `default`) with the
 * `load` that imports the chunk. The parent is evaluated (its imports linked
 * to `stubs` over the parent-module stubs, others to no-op functions) and
 * creates its lazy components then (a lazy component created in render would
 * remount on every render).
 */
export async function chunkExportName(
  parent: string,
  chunkId: string,
  options: { framework?: Framework; stubs?: Record<string, ModuleStub> } = {},
) {
  const framework = options.framework ?? 'react'
  const routerPackage = `@tanstack/${framework}-router`
  const lazy: Array<{
    load: () => Promise<{ chunkId?: string }>
    name: string
  }> = []
  const chunkIds = new Set(getChunkIds(parent))
  const parentId = chunkId.split('?')[0]!
  const graph = createTestModuleGraph({
    modules: { [parentId]: parent },
    stubs: {
      ...hydrateStubs(framework),
      ...options.stubs,
      [routerPackage]: {
        ...(options.stubs?.[routerPackage] as Record<string, unknown>),
        lazyRouteComponent: (
          load: () => Promise<{ chunkId?: string }>,
          name = 'default',
        ) => {
          lazy.push({ load, name })
          return () => null
        },
      },
    },
    fallbackStub: (_, names) =>
      Object.fromEntries([...names].map((name) => [name, () => undefined])),
    framework,
    // Each chunk is a module naming its id.
    load: (id) =>
      chunkIds.has(id) ? `export const chunkId = ${JSON.stringify(id)}` : null,
  })
  await graph.import(parentId)
  const names = new Set<string>()
  for (const { load, name } of lazy) {
    if ((await load()).chunkId === chunkId) {
      names.add(name)
    }
  }
  if (names.size !== 1) {
    throw new Error(
      `expected the parent to render one export of ${chunkId}, got ${[...names].join(', ') || 'none'}`,
    )
  }
  return [...names][0]!
}

/**
 * Renders, with the given props, the `<Hydrate>` chunk `chunk` (the code of
 * the chunk `chunkId`, evaluated with `stubs`): the export of it that the
 * client `parent` renders (`chunkExportName`).
 */
export async function renderChunk(
  parent: string,
  chunkId: string,
  chunk: string,
  props: Record<string, unknown> = {},
  stubs: Record<string, ModuleStub> = {},
) {
  const name = await chunkExportName(parent, chunkId)
  const component = (await evaluateModule(chunk, stubs))[name]
  if (typeof component !== 'function') {
    throw new Error(`expected the chunk to export a component as ${name}`)
  }
  return component(props)
}

/**
 * Parent-module stubs of a framework (default `react`): `<Hydrate>` marks
 * where its children render, lazy chunks render their props.
 */
export function hydrateStubs(
  framework: Framework = 'react',
): Record<string, Record<string, unknown>> {
  return {
    [`@tanstack/${framework}-start`]: {
      Hydrate: (props: { children: unknown }) => `[${props.children ?? ''}]`,
    },
    [`@tanstack/${framework}-start/hydration`]: {
      idle: () => 'idle',
      visible: () => 'visible',
      interaction: () => 'interaction',
      load: () => 'load',
      media: () => 'media',
      never: () => 'never',
    },
    [`@tanstack/${framework}-router`]: {
      lazyRouteComponent: () => (props: Record<string, unknown>) =>
        `lazy(${Object.keys(props)
          .filter((name) => name !== 'children')
          .sort()
          .map((name) => `${name}=${String(props[name])}`)
          .join(',')})`,
    },
  }
}

/** The React parent-module stubs (`hydrateStubs('react')`). */
export const hydrateParentStubs = hydrateStubs('react')

/**
 * Compiles `code` for the client (React unless `framework` says otherwise)
 * and evaluates it once its `<Hydrate>` chunks have loaded, like the browser
 * does: the parent and the chunks are one linked module graph (each chunk
 * compiled like the bundler compiles the virtual module),
 * `lazyRouteComponent(load, exportName)` loads its chunk through `load()` and
 * renders the export it names, and its `preload()` loads the chunk too.
 * `beforeChunksLoad` runs app code between the parent's evaluation and the
 * chunks'. Returns the evaluated parent, the ids of the chunks it imports
 * (`chunkIds`, in source order), `lazyChunks` (every lazy chunk component and
 * whether it rendered) and `preloaded` (the chunk each `preload()` call
 * loaded, by id, evaluated, and the component of it the lazy component
 * renders, in call order; loading the chunks here is not a preload). The parent and every chunk must be valid modules; they may
 * read the globals the source reads. With `chunksFromSource`, the chunks
 * load the way Rsbuild loads them: given the source file's code, from a
 * Hydrate plugin that did not compile the parent (e.g. another build
 * worker).
 */
export async function loadClientModule(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    beforeChunksLoad?: (module: Record<string, any>) => void
    runtime?: string
    /** Id the module is compiled under. */
    id?: string
    /** Default `react`. */
    framework?: Framework
    chunksFromSource?: boolean
  } = {},
) {
  const id = options.id ?? moduleId
  const framework = options.framework ?? 'react'
  const { parent, chunks, plugin } = await compileHydrate('client', code, {
    id,
    framework,
  })
  const lazyChunks: Array<{ name: string; rendered: boolean }> = []
  const loaders: Array<{
    name: string
    load: () => Promise<Record<string, any>>
    component?: (props: unknown) => unknown
  }> = []
  const preloaded: Array<{
    id: string
    module: Record<string, any>
    component: (props: Record<string, unknown>) => any
  }> = []
  const loadedChunkIds: Array<string> = []
  /** Id of the chunk an evaluated chunk namespace is. */
  const chunkIdOf = async (namespace: unknown) => {
    for (const chunkId of loadedChunkIds) {
      if ((await graph.import(chunkId)) === namespace) {
        return chunkId
      }
    }
    throw new Error('preload() loaded a module that is not a chunk')
  }
  const routerPackage = `@tanstack/${framework}-router`
  const userStubs = options.stubs ?? {}
  const stubs: Record<string, ModuleStub> = {
    ...hydrateStubs(framework),
    ...userStubs,
    [routerPackage]: {
      ...(userStubs[routerPackage] as Record<string, unknown>),
      lazyRouteComponent: (
        load: () => Promise<Record<string, any>>,
        name = 'default',
      ) => {
        const lazyChunk = { name, rendered: false }
        const loader: (typeof loaders)[number] = { name, load }
        lazyChunks.push(lazyChunk)
        loaders.push(loader)
        return Object.assign(
          (props: unknown) => {
            lazyChunk.rendered = true
            if (!loader.component) {
              throw new Error(`lazy chunk ${name} rendered before it loaded`)
            }
            return loader.component(props)
          },
          {
            preload: async () => {
              const namespace = await load()
              preloaded.push({
                id: await chunkIdOf(namespace),
                module: namespace,
                component: namespace[name],
              })
              return namespace
            },
          },
        )
      },
    },
  }
  // The globals the source reads may be read by its modules too, and a name
  // the source binds must not lose its binding.
  expect(await getModuleErrors(parent, undefined, { source: code })).toEqual([])
  const chunkPlugin = options.chunksFromSource
    ? createHydrateCompilerPlugin()
    : plugin
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [chunkPlugin],
    framework,
  })
  const graph = createTestModuleGraph({
    modules: { [id]: parent },
    stubs,
    runtime: options.runtime,
    framework,
    // The bundler compiles each virtual module it loads like any other module.
    load: async (chunkId) => {
      // The linker also probes ids with extensions appended, which are no
      // modules of this graph.
      if (chunkId.split('?')[0] !== id.split('?')[0]) {
        return null
      }
      const chunk = options.chunksFromSource
        ? (chunkPlugin.loadVirtualModule?.({
            id: chunkId,
            code,
            root: '/test',
            env: 'client',
            envName: 'client',
          })?.code ?? null)
        : loadChunk(plugin, 'client', chunkId)
      if (chunk === null) {
        return null
      }
      loadedChunkIds.push(chunkId)
      return (await compile(chunk, chunkId)) ?? chunk
    },
  })
  const module = await graph.import(id)
  options.beforeChunksLoad?.(module)
  for (const chunk of chunks) {
    expect(await getModuleErrors(chunk, undefined, { source: code })).toEqual(
      [],
    )
  }
  // Loading a chunk may create the lazy components of nested boundaries,
  // which the iteration reaches as they are appended.
  for (const loader of loaders) {
    loader.component = (await loader.load())[loader.name]
  }
  return { module, chunkIds: getChunkIds(parent), lazyChunks, preloaded }
}

/**
 * The children were split and rendered through their chunks: the client
 * created at least one lazy chunk component (`loadClientModule`), and every
 * one rendered.
 */
export function expectRenderedThroughChunks(
  lazyChunks: Array<{ rendered: boolean }>,
) {
  expect(lazyChunks.length).toBeGreaterThan(0)
  expect(lazyChunks.filter((chunk) => !chunk.rendered)).toEqual([])
}

/**
 * Renders `code` compiled for `env` and records the boundary id (`h`) each
 * `<Hydrate>` renders with: on the server the id in its markup, on the client
 * the id it hydrates with (chunks loaded, `loadClientModule`). `stubs` are
 * linked over the parent-module stubs (`hydrateStubs`); the recording
 * `Hydrate` is added to the `@tanstack/<framework>-start` stub.
 */
export async function renderBoundaries(
  env: 'client' | 'server',
  code: string,
  render: (module: Record<string, any>) => unknown,
  options: {
    id?: string
    framework?: Framework
    stubs?: Record<string, ModuleStub>
    runtime?: string
  } = {},
) {
  const { stubs: userStubs = {}, runtime, ...compileOptions } = options
  const framework = options.framework ?? 'react'
  const ids: Array<unknown> = []
  const Hydrate = (props: { children?: unknown; h?: unknown }) => {
    ids.push(props.h)
    return `[${props.children ?? ''}]`
  }
  const startPackage = `@tanstack/${framework}-start`
  const stubs = {
    ...hydrateStubs(framework),
    ...userStubs,
    [startPackage]: {
      ...(userStubs[startPackage] as Record<string, unknown> | undefined),
      Hydrate,
    },
  }
  const module =
    env === 'server'
      ? await evaluateModule(
          (await compileHydrate('server', code, compileOptions)).parent,
          stubs,
          { framework, runtime },
        )
      : (await loadClientModule(code, { ...compileOptions, stubs, runtime }))
          .module
  const html = render(module)
  return { html, ids }
}
