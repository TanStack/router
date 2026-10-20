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
 * erased and JSX compiles with React's automatic runtime (`react/jsx-runtime`,
 * as `@vitejs/plugin-react` compiles it); there is no JSX stand-in. A graph
 * renders with the real framework when it links real packages (`packages`).
 *
 * API (see each member):
 * - `createModuleGraph(options)`: `modules`, `stubs`, `resolve`, `load`,
 *   `packages` (real packages, e.g. `react`, `react-dom/server`, a router),
 *   `fallbackStub`, `transform`, `scope`, `importMeta`.
 * - `graph.import(id)`, `graph.add(id, code)`, `graph.has(id)`.
 * - Load observers: `graph.evaluated` (graph modules, in evaluation order),
 *   and `graph.requested` (every module the graph's modules requested:
 *   graph modules, stubs, packages).
 * - `graph.importPackage(specifier)`: the instance of a real package the
 *   graph's modules get (to render what they export with the same React).
 * - `graph.fork()`: the same modules and options, fresh module instances (to
 *   observe loading without touching the graph a test inspects).
 */
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
   * module of the graph and over a package with the same specifier.
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
   * Directory real packages resolve from. A bare specifier that is neither a
   * stub nor a module of the graph resolves with Node's own resolver (package
   * `exports`, conditions `node` and `import`) as if a file of this directory
   * imported it, and loads the real package: one instance per test process,
   * shared by every graph, like a dependency every chunk of an app shares.
   * A specifier that does not resolve there goes to `fallbackStub`.
   */
  packages?: string
  /**
   * Stubs a specifier that is neither a stub, a module of the graph nor a
   * package (`packages`), given the names its importer imports from it.
   * Without it, such an import fails to link, or a dynamic one fails when it
   * runs. One stub serves every importer of the specifier, like one module
   * of a bundle: it is called again only for names earlier importers did not
   * import, and the values it gave keep their identity.
   */
  fallbackStub?: (specifier: string, names: Set<string>) => ModuleStub
  /**
   * The default transform erases TypeScript the way Vite does in a project
   * with `verbatimModuleSyntax` (default `true`): only `import type`
   * declarations and `type` specifiers go (`import { type X } from './x'`
   * still loads `./x`, as `import './x'`), so an import a module never uses
   * still loads its module. A compiler that leaves a dead import of a
   * server-only or side-effectful module in its output therefore loads it
   * here too (user ruling L3, 2026-10-17: an import left with only type uses
   * need not load; dropping it is the compiler's job). `false` erases
   * TypeScript like a project without it: imports nothing reads go too.
   */
  verbatimModuleSyntax?: boolean
  /**
   * Package the default transform's automatic JSX runtime imports
   * (`<source>/jsx-runtime`); default `react`.
   */
  jsxImportSource?: string
  /** Compiles a module to JavaScript; by default TS and JSX are erased. */
  transform?: (code: string, id: string) => string | Promise<string>
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
  /**
   * Whether the graph has a module with this id (given, added or loaded so
   * far; not a stub or a package).
   */
  has: (id: string) => boolean
  /** Ids of the graph's modules, in the order they started evaluating. */
  evaluated: Array<string>
  /**
   * Every module the graph's modules requested so far, once each, in the
   * order Node resolved them: ids of modules of the graph, specifiers of
   * stubs and of packages. A static import is requested when its importer
   * links (before any of them evaluates), a dynamic one when it runs. What
   * `importPackage` starts is not requested.
   */
  requested: Array<string>
  /**
   * The namespace of a real package (`packages`) as the graph's modules get
   * it: the same instance (e.g. the React the modules' JSX creates elements
   * of).
   */
  importPackage: (specifier: string) => Promise<Record<string, any>>
  /**
   * A new graph with the same options and the same modules (those added or
   * loaded since included), whose modules evaluate fresh instances. Stubs
   * and packages are the same values. Compiled code is reused.
   */
  fork: () => ModuleGraph
}

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
  /**
   * Specifiers the module imports from real packages, with the names it
   * imports from each.
   */
  packages?: Map<string, Set<string>>
  /** Why the module could not be prepared; loading it throws this error. */
  failure?: unknown
  /** A module of the harness (not the app's): its requests are not recorded. */
  internal?: boolean
  /** The specifier a stub serves. */
  specifier?: string
}

interface Graph {
  id: number
  options: ModuleGraphOptions
  /** Served modules by URL. */
  served: Map<string, ServedModule>
  /** Exports of each served object stub, by URL. */
  stubs: Map<string, Record<string, unknown>>
  evaluated: Array<string>
  requested: Array<string>
  /** URL a file of `options.packages` has, to resolve packages from. */
  packagesParent?: string
  /** URL of the fallback stub of a specifier, if `fallbackStub` gives one. */
  fallbackUrl: (specifier: string, names: Set<string>) => string | undefined
}

interface Registry {
  graphs: Map<number, Graph>
  nextGraph: number
}

const scheme = 'compiler-test-module:'
const registryKey = Symbol.for('tanstack.compiler-test-utils.module-linker')
const registryExpression = `globalThis[Symbol.for(${JSON.stringify(registryKey.description)})]`

/** Records a module a graph's module requested (see `requested`). */
function recordRequest(graph: Graph, requested: string) {
  if (!graph.requested.includes(requested)) {
    graph.requested.push(requested)
  }
}

function getRegistry(): Registry {
  const global = globalThis as unknown as Record<symbol, Registry | undefined>
  if (!global[registryKey]) {
    global[registryKey] = { graphs: new Map(), nextGraph: 0 }
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (lookup(specifier)) {
          return { url: specifier, shortCircuit: true }
        }
        const parent = context.parentURL ? lookup(context.parentURL) : undefined
        if (!parent) {
          return nextResolve(specifier, context)
        }
        const { graph } = parent
        const url = parent.module.imports.get(specifier)
        const names = parent.module.packages?.get(specifier)
        if (url === undefined && names === undefined) {
          throw new Error(
            `No stub for import ${specifier} (imported by ${parent.id})`,
          )
        }
        const target = url === undefined ? specifier : targetName(url)
        if (!parent.module.internal) {
          recordRequest(graph, target)
        }
        if (url !== undefined) {
          return { url, shortCircuit: true }
        }
        try {
          return nextResolve(specifier, {
            ...context,
            parentURL: graph.packagesParent,
          })
        } catch (error) {
          const fallback = graph.fallbackUrl(specifier, names!)
          if (fallback === undefined) {
            throw error
          }
          return { url: fallback, shortCircuit: true }
        }
      },
      load(url, context, nextLoad) {
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

type UrlKind = 'module' | 'stub' | 'failed' | 'package'

function graphUrl(graph: Graph, kind: UrlKind, id: string) {
  return `${scheme}//g${graph.id}/${kind}/${encodeURIComponent(id)}`
}

/** The served module of a URL of the linker, its id and its graph. */
function lookup(url: string) {
  const match = /^compiler-test-module:\/\/g(\d+)\/(\w+)\/(.*)$/.exec(url)
  const graph = match ? getRegistry().graphs.get(Number(match[1])) : undefined
  const module = graph?.served.get(url)
  return (
    module && {
      module,
      graph: graph!,
      id: decodeURIComponent(match![3]!),
    }
  )
}

/**
 * What `requested` names the target of a URL by: a module's id, a
 * stub's specifier.
 */
function targetName(url: string) {
  const found = lookup(url)
  if (!found) {
    return url
  }
  return found.module.specifier ?? found.id
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

/**
 * Erases TypeScript the way Vite does (see `verbatimModuleSyntax`) and
 * compiles JSX with React's automatic runtime from `jsxImportSource`, as
 * `@vitejs/plugin-react` does.
 */
async function defaultTransform(
  code: string,
  id: string,
  options: ModuleGraphOptions,
) {
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: {
      runtime: 'automatic',
      importSource: options.jsxImportSource ?? 'react',
    },
    typescript: {
      onlyRemoveTypeImports: options.verbatimModuleSyntax ?? true,
    },
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

/** Whether a specifier names a package (not a path, not a URL). */
function isBareSpecifier(specifier: string) {
  return !/^(?:[./]|[a-zA-Z][\w+.-]*:)/.test(specifier)
}

// Node's own `import()`, which runs the module hooks (Vitest's module runner
// handles the `import()` calls of test files itself).
const nativeImport = createRequire(import.meta.url)('./native-import.cjs') as (
  specifier: string,
) => Promise<Record<string, any>>

/**
 * Creates a graph of in-memory modules linked to each other, to stubs and to
 * real packages (`packages`). A module imported twice from one graph is
 * evaluated once, like in a bundle.
 */
export function createModuleGraph(
  options: ModuleGraphOptions = {},
): ModuleGraph {
  return createGraph(options, new Map())
}

/**
 * `createModuleGraph`, with the compiled code of each module source shared
 * with the graph's forks (by id, then by source).
 */
function createGraph(
  options: ModuleGraphOptions,
  compiled: Map<string, { code: string; javascript: Promise<string> }>,
): ModuleGraph {
  const registry = getRegistry()
  const sources = new Map(Object.entries(options.modules ?? {}))
  const graph: Graph = {
    id: registry.nextGraph++,
    options,
    served: new Map(),
    stubs: new Map(),
    evaluated: [],
    requested: [],
    packagesParent:
      options.packages === undefined
        ? undefined
        : pathToFileURL(path.join(options.packages, 'importer.js')).href,
    fallbackUrl: (specifier, names) => {
      const fallback = fallbackFor(specifier, names)
      return fallback === undefined ? undefined : stubUrl(specifier, fallback)
    },
  }
  registry.graphs.set(graph.id, graph)
  const transform =
    options.transform ??
    ((code: string, id: string) => defaultTransform(code, id, options))
  const compile = (code: string, id: string) => {
    const known = compiled.get(id)
    if (known && known.code === code) {
      return known.javascript
    }
    const javascript = Promise.resolve(transform(code, id))
    compiled.set(id, { code, javascript })
    return javascript
  }
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
   * URL of a stub. An object stub exports its own keys: a stub whose keys
   * grew since it was served (see `fallbackFor`) is served anew, with the
   * same values.
   */
  const firstStubKeys = new Map<string, string>()
  const stubUrl = (specifier: string, stub: ModuleStub) => {
    if (typeof stub === 'string') {
      const url = graphUrl(graph, 'stub', specifier)
      if (!graph.served.has(url)) {
        graph.served.set(url, {
          format: specifier.endsWith('.json') ? 'json' : 'module',
          source: stub,
          imports: new Map(),
          specifier,
        })
      }
      return url
    }
    const exported = Object.keys(stub)
    const keys = exported.join(',')
    if (!firstStubKeys.has(specifier)) {
      firstStubKeys.set(specifier, keys)
    }
    const url = graphUrl(
      graph,
      'stub',
      firstStubKeys.get(specifier) === keys
        ? specifier
        : `${specifier}#${keys}`,
    )
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
        specifier,
      })
    }
    return url
  }

  /** The fallback stub of each specifier (see `fallbackStub`). */
  const fallbacks = new Map<string, ModuleStub>()
  const fallbackFor = (specifier: string, names: Set<string>) => {
    if (!options.fallbackStub) {
      return undefined
    }
    const known = fallbacks.get(specifier)
    if (known === undefined) {
      const stub = options.fallbackStub(specifier, names)
      const merged = typeof stub === 'string' ? stub : { ...stub }
      fallbacks.set(specifier, merged)
      return merged
    }
    if (typeof known === 'string') {
      return known
    }
    const missing = new Set([...names].filter((name) => !(name in known)))
    if (missing.size > 0) {
      const more = options.fallbackStub(specifier, missing)
      if (typeof more !== 'string') {
        for (const [name, value] of Object.entries(more)) {
          if (!(name in known)) {
            known[name] = value
          }
        }
      }
    }
    return known
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
        const javascript = await compile(code, id)
        // A hashbang must stay first: the prologue goes after its line
        const [, hashbang = '', body = javascript] =
          /^(#![^\n]*\n)([\s\S]*)$/.exec(javascript) ?? []
        const module: ServedModule = {
          format: 'module',
          // The prologue is one line, so that line numbers in stack traces
          // stay those of the module.
          source: `${hashbang}${prologue(id)}${body}`,
          imports: new Map(),
          packages: new Map(),
        }
        graph.served.set(graphUrl(graph, 'module', id), module)
        const requests = moduleRequests(javascript)
        const dependencies: Array<{ id: string; dynamic: boolean }> = []
        const resolve = async (specifier: string, dynamic: boolean) => {
          if (
            module.imports.has(specifier) ||
            module.packages!.has(specifier)
          ) {
            return
          }
          const names = requests.names.get(specifier) ?? new Set<string>()
          if (options.stubs && Object.hasOwn(options.stubs, specifier)) {
            module.imports.set(
              specifier,
              stubUrl(specifier, options.stubs[specifier]!),
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
          // Resolved by Node when the module links (see the resolve hook),
          // falling back to `fallbackStub` then.
          if (graph.packagesParent && isBareSpecifier(specifier)) {
            module.packages!.set(specifier, names)
            return
          }
          const fallback = fallbackFor(specifier, names)
          if (fallback !== undefined) {
            module.imports.set(specifier, stubUrl(specifier, fallback))
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
    has: (id) => sources.has(id),
    add(id, code) {
      if (sources.has(id) && sources.get(id) !== code) {
        throw new Error(`Module ${id} is already in the graph`)
      }
      sources.set(id, code)
    },
    evaluated: graph.evaluated,
    requested: graph.requested,
    async importPackage(specifier) {
      if (!graph.packagesParent) {
        throw new Error('importPackage needs the `packages` option')
      }
      const url = graphUrl(graph, 'package', specifier)
      if (!graph.served.has(url)) {
        graph.served.set(url, {
          format: 'module',
          source: `import * as namespace from ${JSON.stringify(specifier)}\nexport { namespace }`,
          imports: new Map(),
          packages: new Map([[specifier, new Set()]]),
          internal: true,
        })
      }
      return (await nativeImport(url)).namespace
    },
    fork() {
      return createGraph(
        { ...options, modules: Object.fromEntries(sources) },
        compiled,
      )
    },
  }
}
