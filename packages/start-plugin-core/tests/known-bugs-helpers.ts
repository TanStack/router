import { transformWithOxc } from 'vite'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import type { StartCompilerPlugin } from '../src/types'

type Env = 'client' | 'server'

/**
 * One build-mode `StartCompiler` configured like `compileStartModule`, for
 * tests that compile several modules with the same compiler (a production
 * build compiles every importer with one instance) or a module under a
 * specific id.
 *
 * @returns a function compiling `code` as module `id`; `null` means the
 * module is left untransformed.
 */
export function createStartModuleCompiler(options: {
  env: Env
  /** Extra project modules by absolute id; `./name` resolves to `/test/src/name.ts`. */
  files?: Record<string, string>
  compilerPlugins?: Array<StartCompilerPlugin>
}) {
  const { env, files = {} } = options
  const compiler: StartCompiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
    getKnownServerFns: () => ({}),
    loadModule: async (id) => {
      const code = files[id]
      if (code !== undefined) {
        compiler.ingestModule({ code, id })
      }
    },
    resolveId: async (id) => {
      if (id.startsWith('@tanstack/')) {
        return id
      }
      const file = id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id
      return file in files ? file : null
    },
    compilerPlugins: options.compilerPlugins,
  })
  return async (code: string, id: string) => {
    const result = await compiler.compile({
      code,
      id,
      detectedKinds: detectKindsInCode(code, env),
    })
    return result?.code ?? null
  }
}

/**
 * Compiles a module containing `<Hydrate>` boundaries with the Hydrate
 * compiler plugin and loads the split chunks it imports.
 */
export async function compileHydrate(env: Env, code: string) {
  const plugin = createHydrateCompilerPlugin()
  const compile = createStartModuleCompiler({ env, compilerPlugins: [plugin] })
  const parent = await compile(code, '/test/src/module.tsx')
  /** Loads a split chunk (virtual module) by id. */
  const loadChunk = (id: string) => {
    const chunk = plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    })
    if (!chunk) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return chunk.code
  }
  const chunkIds = parent ? getChunkIds(parent) : []
  return {
    /** The compiled module, `null` when it is left untransformed. */
    parent,
    /** The ids of the split chunks `parent` imports, in source order. */
    chunkIds,
    /** The split chunks `parent` imports, in source order. */
    chunks: chunkIds.map(loadChunk),
    loadChunk,
    /** Compiles a loaded chunk under its id, like the bundler does. */
    compileChunk: (id: string) => compile(loadChunk(id), id),
  }
}

/** The Hydrate chunk ids a compiled module imports, in source order. */
export function getChunkIds(code: string) {
  return [...code.matchAll(/import\((["'])(.+?)\1\)/g)]
    .map(([, , id]) => id!)
    .filter((id) => id.includes('tss-hydrate='))
}

/** Renders JSX to text: intrinsic elements become tags, components are called. */
const renderRuntime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/**
 * Evaluates a Hydrate chunk like a bundler would and renders its component
 * export (`H<index>`) with `props`: JSX becomes plain calls, intrinsic
 * elements become tags, and imports listed in `imports` are linked to the
 * given module sources.
 */
export async function renderChunk(
  chunk: string,
  options: {
    props?: Record<string, unknown>
    imports?: Record<string, string>
  } = {},
) {
  const { props = {}, imports = {} } = options
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const linked = code.replace(
    /(from\s*)(["'])([^"']+)\2/g,
    (match, from: string, _quote: string, source: string) =>
      source in imports
        ? `${from}${JSON.stringify(toDataUrl(imports[source]!))}`
        : match,
  )
  const module: Record<string, (props: unknown) => unknown> = await import(
    /* @vite-ignore */ toDataUrl(renderRuntime + linked)
  )
  const name = Object.keys(module).find((key) => /^H\d+$/.test(key))
  if (!name) {
    throw new Error('expected the chunk to export a component')
  }
  return module[name]!(props)
}

function toDataUrl(code: string) {
  return `data:text/javascript,${encodeURIComponent(code)}`
}
