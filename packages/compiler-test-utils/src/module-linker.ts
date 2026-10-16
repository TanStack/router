/**
 * Evaluates test modules as real ES modules, the way a bundler's output runs:
 * Node's own linker links every import and export form (default, namespace,
 * side-effect imports, `export * from`, `export { x } from`, JSON modules),
 * live bindings and cycles, and a dynamic `import()` evaluates its module
 * only when it is called.
 *
 * Module sources live in memory (a module graph) and are served through
 * in-thread module hooks (`module.registerHooks`) under URLs that are unique
 * per graph, so every graph evaluates fresh module instances. TypeScript is
 * erased and JSX compiles to calls of `__jsx`/`__Fragment` (`jsxPragma`),
 * by default a text renderer: intrinsic elements become tags, components are
 * called.
 */
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { parseSync, transformWithOxc } from 'vite'

/**
 * A module provided by the test instead of a real module: its exports, or
 * its source code (`.json` specifiers: a JSON module). Source stubs are not
 * compiled and cannot import other modules.
 */
export type ModuleStub = string | Record<string, unknown>

export interface ModuleGraphOptions {
  /** Source of each module of the graph (TypeScript and JSX), by module id. */
  modules?: Record<string, string>
  /**
   * Modules by the specifier modules import them with. A stub wins over a
   * module of the graph with the same specifier.
   */
  stubs?: Record<string, ModuleStub>
  /**
   * Maps an import specifier to the id of a module of the graph, or
   * `undefined` when it names none. By default, an absolute or relative
   * specifier names the module at that path, with or without an extension,
   * its query kept.
   */
  resolve?: (specifier: string, importer: string) => string | undefined
  /**
   * Source of a module id that is not a module of the graph yet (e.g. a
   * virtual module), or `null` when unknown.
   */
  load?: (
    id: string,
  ) => string | null | undefined | Promise<string | null | undefined>
  /**
   * Stubs a specifier that is neither a stub nor a module of the graph,
   * given the names its importer imports from it. Without it (and without
   * `lenient`), such an import fails to link, or a dynamic one fails when it
   * runs.
   */
  fallbackStub?: (specifier: string, names: Set<string>) => ModuleStub
  /**
   * Gives every import the graph cannot resolve, and every name a module
   * imports from an object stub without it, an `undefined` value instead of
   * failing to link.
   */
  lenient?: boolean
  /** Compiles a module to JavaScript; by default TS and JSX are erased. */
  transform?: (code: string, id: string) => string | Promise<string>
  /**
   * Code run at the top of each module that defines its JSX factories
   * (`__jsx` and `__Fragment`), instead of the default text renderer.
   */
  runtime?: string
  /** Bindings declared at the top of each module (e.g. `$RefreshReg$`). */
  scope?: (id: string) => Record<string, unknown>
  /** Properties assigned to `import.meta` of each module before it runs. */
  importMeta?: (id: string) => Record<string, unknown>
}

export interface ModuleGraph {
  /**
   * Evaluates a module of the graph and what it imports statically (once
   * per graph) and returns its namespace.
   */
  import: (id: string) => Promise<Record<string, any>>
  /** Adds a module to the graph. */
  add: (id: string, code: string) => void
  /** Id of the module with this source, if the graph has it. */
  idOf: (code: string) => string | undefined
  /** Ids of the graph's modules, in the order they started evaluating. */
  evaluated: Array<string>
  /**
   * Runs `run` and returns the ids of the graph's modules (or the
   * specifiers of stubs) whose dynamic `import()` it starts synchronously,
   * without loading or evaluating them: those imports reject, and a promise
   * `run` returns is settled silently. Later imports load as usual.
   */
  probeDynamicImports: (run: () => unknown) => Array<string>
}

/** The JSX factory names compiled modules call. */
export const jsxPragma = { pragma: '__jsx', pragmaFrag: '__Fragment' }

/** Language of a module id for Oxc, from its file extension. */
export function moduleLang(id: string) {
  const extension = /\.([cm]?[jt]sx?)(?:[?#].*)?$/.exec(id)?.[1] ?? 'tsx'
  if (/^[cm]?ts$/.test(extension)) {
    return 'ts' as const
  }
  if (extension === 'tsx') {
    return 'tsx' as const
  }
  return 'jsx' as const
}

interface ServedModule {
  format: 'module' | 'json'
  source: string
  /** URL each specifier the module imports resolves to. */
  imports: Map<string, string>
  /** Why the module could not be prepared; loading it throws this error. */
  failure?: unknown
}

interface Graph {
  id: number
  options: ModuleGraphOptions
  /** Served modules by URL. */
  served: Map<string, ServedModule>
  /** Exports of each served object stub, by URL. */
  stubs: Map<string, Record<string, unknown>>
  evaluated: Array<string>
  /** Targets of the dynamic imports started while probing, else undefined. */
  probed?: Array<string>
}

interface Registry {
  graphs: Map<number, Graph>
  nextGraph: number
  jsx: Record<string, unknown>
}

const scheme = 'compiler-test-module:'
const registryKey = Symbol.for('tanstack.compiler-test-utils.module-linker')
const registryExpression = `globalThis[Symbol.for(${JSON.stringify(registryKey.description)})]`
const runtimeUrl = `${scheme}//runtime/jsx`

/** Renders JSX to text: intrinsic elements become tags, components are called. */
function createJsxRuntime() {
  const Fragment = Symbol('Fragment')
  const h = (type: unknown, props: unknown, ...children: Array<unknown>) => {
    const text = children
      .flat(Infinity)
      .filter((child) => child != null && child !== false && child !== true)
      .join('')
    if (type === Fragment) {
      return text
    }
    if (typeof type === 'function') {
      return type({ ...(props as object), children: text })
    }
    if (typeof type !== 'string') {
      throw new Error('cannot render ' + String(type))
    }
    return '<' + type + '>' + text + '</' + type + '>'
  }
  return { h, Fragment }
}

function getRegistry(): Registry {
  const global = globalThis as unknown as Record<symbol, Registry | undefined>
  if (!global[registryKey]) {
    global[registryKey] = {
      graphs: new Map(),
      nextGraph: 0,
      jsx: createJsxRuntime(),
    }
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === runtimeUrl || lookup(specifier)) {
          return { url: specifier, shortCircuit: true }
        }
        const parent = context.parentURL ? lookup(context.parentURL) : undefined
        if (parent) {
          const url = parent.module.imports.get(specifier)
          if (url === undefined) {
            throw new Error(
              `No stub for import ${specifier} (imported by ${parent.id})`,
            )
          }
          // Node resolves a dynamic import synchronously when it starts:
          // while a graph probes, record its target instead of loading it.
          if (parent.graph.probed) {
            parent.graph.probed.push(lookup(url)?.id ?? specifier)
            throw new ProbedImport()
          }
          return { url, shortCircuit: true }
        }
        return nextResolve(specifier, context)
      },
      load(url, context, nextLoad) {
        if (url === runtimeUrl) {
          return {
            format: 'module',
            source: `const { h, Fragment } = ${registryExpression}.jsx
export { h as ${jsxPragma.pragma}, Fragment as ${jsxPragma.pragmaFrag} }`,
            shortCircuit: true,
          }
        }
        const found = lookup(url)
        if (!found) {
          return nextLoad(url, context)
        }
        if (found.module.failure !== undefined) {
          throw found.module.failure
        }
        return {
          format: found.module.format,
          source: found.module.source,
          shortCircuit: true,
        }
      },
    })
  }
  return global[registryKey]
}

type UrlKind = 'module' | 'stub' | 'failed'

function graphUrl(graph: Graph, kind: UrlKind, id: string) {
  return `${scheme}//g${graph.id}/${kind}/${encodeURIComponent(id)}`
}

/** The served module of a URL of the linker, its id and its graph. */
function lookup(url: string) {
  const match = /^compiler-test-module:\/\/g(\d+)\/(\w+)\/(.*)$/.exec(url)
  const graph = match ? getRegistry().graphs.get(Number(match[1])) : undefined
  const module = graph?.served.get(url)
  return module && { module, graph: graph!, id: decodeURIComponent(match![3]!) }
}

/** Rejects a dynamic import started while its graph probes imports. */
class ProbedImport extends Error {
  constructor() {
    super('a dynamic import started while probing (not loaded)')
  }
}

/** The modules a compiled module requests, and the names it imports. */
function moduleRequests(javascript: string) {
  const { module } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  const names = new Map<string, Set<string>>()
  const request = (specifier: string, name?: string) => {
    let requested = names.get(specifier)
    if (!requested) {
      requested = new Set()
      names.set(specifier, requested)
    }
    if (name !== undefined) {
      requested.add(name)
    }
  }
  for (const statement of module.staticImports) {
    const specifier = statement.moduleRequest.value
    request(specifier)
    for (const entry of statement.entries) {
      if (entry.importName.kind === 'Name') {
        request(specifier, entry.importName.name!)
      } else if (entry.importName.kind === 'Default') {
        request(specifier, 'default')
      }
    }
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) {
        request(
          entry.moduleRequest.value,
          entry.importName.kind === 'Name' ? entry.importName.name! : undefined,
        )
      }
    }
  }
  const dynamic: Array<string> = []
  for (const dynamicImport of module.dynamicImports) {
    const source = javascript.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    )
    // Only a static specifier (a string literal, or a template literal
    // without substitutions) resolves ahead of time; any other fails when
    // the import runs.
    const literal = /^(?:(["'])([^"'\\]*)\1|`((?:[^`\\$]|\$(?!\{))*)`)$/.exec(
      source,
    )
    if (literal) {
      dynamic.push((literal[2] ?? literal[3])!)
    }
  }
  return { static: [...names.keys()], dynamic, names }
}

async function defaultTransform(code: string, id: string) {
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: { runtime: 'classic', ...jsxPragma },
  })
  return result.code
}

const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json']

/**
 * Ids an absolute or relative specifier may name: its path with each
 * extension, its query kept.
 */
function candidateIds(specifier: string, importer: string) {
  if (!specifier.startsWith('/') && !specifier.startsWith('.')) {
    return []
  }
  const [, file, query] = /^([^?#]*)(.*)$/s.exec(specifier)!
  const absolute = file!.startsWith('/')
    ? file!
    : path.posix.join(
        path.posix.dirname(importer.replace(/[?#].*$/, '')),
        file!,
      )
  return extensions.map((extension) => `${absolute}${extension}${query}`)
}

// Node's own `import()`, which runs the module hooks (Vitest's module runner
// handles the `import()` calls of test files itself).
const nativeImport = createRequire(import.meta.url)('./native-import.cjs') as (
  specifier: string,
) => Promise<Record<string, any>>

/**
 * Creates a graph of in-memory modules linked to each other and to stubs. A
 * module imported twice from one graph is evaluated once, like in a bundle.
 */
export function createModuleGraph(
  options: ModuleGraphOptions = {},
): ModuleGraph {
  const registry = getRegistry()
  const graph: Graph = {
    id: registry.nextGraph++,
    options,
    served: new Map(),
    stubs: new Map(),
    evaluated: [],
  }
  registry.graphs.set(graph.id, graph)
  const sources = new Map(Object.entries(options.modules ?? {}))
  const transform = options.transform ?? defaultTransform
  const graphExpression = `${registryExpression}.graphs.get(${graph.id})`
  const preparing = new Map<
    string,
    Promise<Array<{ id: string; dynamic: boolean }>>
  >()

  /** Whether the graph has a module with this id, loading it if needed. */
  const hasModule = async (id: string) => {
    if (sources.has(id)) {
      return true
    }
    const loaded = await options.load?.(id)
    if (loaded === null || loaded === undefined) {
      return false
    }
    sources.set(id, loaded)
    return true
  }

  const resolveModule = async (specifier: string, importer: string) => {
    const candidates = options.resolve
      ? [options.resolve(specifier, importer)]
      : candidateIds(specifier, importer)
    for (const id of candidates) {
      if (id !== undefined && (await hasModule(id))) {
        return id
      }
    }
    return undefined
  }

  /**
   * URL of a stub, for an importer that imports `names` from it. A stub made
   * for one importer (`importer`) is an instance of its own.
   */
  const stubUrl = (
    specifier: string,
    stub: ModuleStub,
    names: Set<string>,
    importer?: string,
  ) => {
    if (typeof stub === 'string') {
      const url = graphUrl(graph, 'stub', specifier)
      if (!graph.served.has(url)) {
        graph.served.set(url, {
          format: specifier.endsWith('.json') ? 'json' : 'module',
          source: stub,
          imports: new Map(),
        })
      }
      return url
    }
    // An object stub exports its own keys and, in a lenient graph, any name
    // its importer asks for; each set of names is an instance then.
    const exported = new Set(Object.keys(stub))
    if (options.lenient) {
      names.forEach((name) => exported.add(name))
    }
    const key =
      importer !== undefined
        ? `${specifier}#${importer}`
        : options.lenient
          ? `${specifier}#${[...exported].sort().join(',')}`
          : specifier
    const url = graphUrl(graph, 'stub', key)
    if (!graph.served.has(url)) {
      graph.stubs.set(url, stub)
      const lines = [
        `const stub = ${graphExpression}.stubs.get(${JSON.stringify(url)})`,
      ]
      let index = 0
      for (const name of exported) {
        lines.push(
          `const value${index} = stub[${JSON.stringify(name)}]`,
          `export { value${index} as ${JSON.stringify(name)} }`,
        )
        index++
      }
      graph.served.set(url, {
        format: 'module',
        source: lines.join('\n'),
        imports: new Map(),
      })
    }
    return url
  }

  /** Serves a module that throws `failure` when it loads. */
  const failedUrl = (id: string, failure: unknown) => {
    const url = graphUrl(graph, 'failed', id)
    graph.served.set(url, {
      format: 'module',
      source: '',
      imports: new Map(),
      failure,
    })
    return url
  }

  const prologue = (id: string) => {
    const scope = Object.keys(options.scope?.(id) ?? {})
    return [
      ...(options.runtime === undefined
        ? [
            `import { ${jsxPragma.pragma}, ${jsxPragma.pragmaFrag} } from ${JSON.stringify(runtimeUrl)};`,
          ]
        : []),
      ...(scope.length
        ? [
            `const { ${scope.join(', ')} } = ${graphExpression}.options.scope(${JSON.stringify(id)});`,
          ]
        : []),
      ...(options.importMeta
        ? [
            `Object.assign(import.meta, ${graphExpression}.options.importMeta(${JSON.stringify(id)}));`,
          ]
        : []),
      `${graphExpression}.evaluated.push(${JSON.stringify(id)});`,
    ].join(' ')
  }

  /**
   * Compiles a module, resolves its imports and returns the modules of the
   * graph it imports, statically or dynamically.
   */
  const prepareModule = (id: string) => {
    let prepared = preparing.get(id)
    if (!prepared) {
      prepared = (async () => {
        const code = sources.get(id)
        if (code === undefined) {
          throw new Error(`No module ${id} in the graph`)
        }
        const javascript = await transform(code, id)
        const module: ServedModule = {
          format: 'module',
          // The prologue is one line, so that line numbers in stack traces
          // stay those of the module (without `runtime`).
          source: `${prologue(id)}${options.runtime ?? ''}${javascript}`,
          imports: new Map(),
        }
        graph.served.set(graphUrl(graph, 'module', id), module)
        const requests = moduleRequests(javascript)
        const dependencies: Array<{ id: string; dynamic: boolean }> = []
        const resolve = async (specifier: string, dynamic: boolean) => {
          if (module.imports.has(specifier)) {
            return
          }
          const names = requests.names.get(specifier) ?? new Set<string>()
          if (options.stubs && Object.hasOwn(options.stubs, specifier)) {
            module.imports.set(
              specifier,
              stubUrl(specifier, options.stubs[specifier]!, names),
            )
            return
          }
          let target: string | undefined
          try {
            target = await resolveModule(specifier, id)
          } catch (error) {
            if (!dynamic) {
              throw error
            }
            // Loading a dynamically imported module failed: the import
            // fails when it runs.
            module.imports.set(
              specifier,
              failedUrl(`${id}:${specifier}`, error),
            )
            return
          }
          if (target !== undefined) {
            module.imports.set(specifier, graphUrl(graph, 'module', target))
            dependencies.push({ id: target, dynamic })
            return
          }
          const fallback =
            options.fallbackStub?.(specifier, names) ??
            (options.lenient ? {} : undefined)
          if (fallback !== undefined) {
            module.imports.set(
              specifier,
              stubUrl(specifier, fallback, names, id),
            )
            return
          }
          // A dynamic import the graph cannot resolve fails when it runs.
          if (!dynamic) {
            throw new Error(
              `No stub for import ${specifier} (imported by ${id})`,
            )
          }
        }
        for (const specifier of requests.static) {
          await resolve(specifier, false)
        }
        for (const specifier of requests.dynamic) {
          await resolve(specifier, true)
        }
        return dependencies
      })()
      preparing.set(id, prepared)
    }
    return prepared
  }

  /**
   * Prepares a module and every module it reaches. A module only reachable
   * through dynamic imports that cannot be prepared fails when it is
   * imported, not before.
   */
  const prepare = async (entry: string) => {
    const queue = [{ id: entry, dynamic: false }]
    const seen = new Set([entry])
    for (let item = queue.shift(); item; item = queue.shift()) {
      let dependencies: Array<{ id: string; dynamic: boolean }>
      try {
        dependencies = await prepareModule(item.id)
      } catch (error) {
        if (!item.dynamic) {
          throw error
        }
        graph.served.set(graphUrl(graph, 'module', item.id), {
          format: 'module',
          source: '',
          imports: new Map(),
          failure: error,
        })
        continue
      }
      for (const dependency of dependencies) {
        if (!seen.has(dependency.id)) {
          seen.add(dependency.id)
          queue.push({
            id: dependency.id,
            dynamic: item.dynamic || dependency.dynamic,
          })
        }
      }
    }
  }

  return {
    async import(id) {
      if (!(await hasModule(id))) {
        throw new Error(`No module ${id} in the graph`)
      }
      await prepare(id)
      return nativeImport(graphUrl(graph, 'module', id))
    },
    add(id, code) {
      if (sources.has(id) && sources.get(id) !== code) {
        throw new Error(`Module ${id} is already in the graph`)
      }
      sources.set(id, code)
    },
    idOf(code) {
      for (const [id, source] of sources) {
        if (source === code) {
          return id
        }
      }
      return undefined
    },
    evaluated: graph.evaluated,
    probeDynamicImports(run) {
      const probed: Array<string> = []
      graph.probed = probed
      let result: unknown
      try {
        result = run()
      } finally {
        graph.probed = undefined
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<unknown>).then(undefined, () => {})
      }
      return probed
    },
  }
}
