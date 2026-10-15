/**
 * Evaluates test modules as real ES modules: Node links them, so every
 * import and export form, live bindings, cycles and dynamic imports behave
 * like in a bundle. Module sources live in memory (a module graph) and are
 * served through synchronous module hooks under a private URL scheme.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { parseSync, transformWithOxc } from 'vite'
import type { ESTree } from 'vite'

/** Module stub: module source code, or the exports of the module. */
export type ModuleStub = string | Record<string, unknown>

export interface ModuleGraphOptions {
  /** Project modules (TypeScript and JSX) by absolute id. */
  modules?: Record<string, string>
  /** Modules by import specifier, as written in the importing module. */
  stubs?: Record<string, ModuleStub>
  /**
   * Source of a module id that is neither a project module nor a stub
   * (virtual modules); `null` when unknown.
   */
  load?: (id: string) => string | null | Promise<string | null>
  /** Code prepended to every project module (e.g. its JSX factory). */
  runtime?: string
  /**
   * Gives every import a module the graph cannot resolve, and every name a
   * module imports from an object stub without it, an `undefined` value
   * instead of failing to link.
   */
  lenient?: boolean
}

interface PreparedModule {
  format: 'module' | 'json'
  source: string
  /** Resolved URL of each specifier the module imports. */
  imports: Map<string, string>
  /**
   * Why a module only reachable through dynamic imports could not be
   * prepared; loading it throws this error.
   */
  failure?: unknown
}

interface GraphState {
  modules: Map<string, PreparedModule>
}

const scheme = 'start-compiler-test:'
const stateKey = Symbol.for('start-compiler-test.module-graphs')
type GlobalState = { graphs: Map<string, GraphState>; next: number }
const globalState: GlobalState = ((globalThis as Record<symbol, unknown>)[
  stateKey
] as GlobalState | undefined) ?? { graphs: new Map(), next: 0 }
if (!(stateKey in globalThis)) {
  ;(globalThis as Record<symbol, unknown>)[stateKey] = globalState
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith(scheme)) {
        return { url: specifier, shortCircuit: true }
      }
      if (context.parentURL?.startsWith(scheme)) {
        const url = lookup(context.parentURL).imports.get(specifier)
        if (url === undefined) {
          throw new Error(`No stub for import ${specifier}`)
        }
        return { url, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url.startsWith(scheme)) {
        const { format, source, failure } = lookup(url)
        if (failure !== undefined) {
          throw failure
        }
        return { format, source, shortCircuit: true }
      }
      return nextLoad(url, context)
    },
  })
}

function moduleUrl(graph: string, id: string) {
  return `${scheme}${graph}/${encodeURIComponent(id)}`
}

function lookup(url: string) {
  const [graph, id] = url.slice(scheme.length).split('/') as [string, string]
  const module = globalState.graphs
    .get(graph)
    ?.modules.get(decodeURIComponent(id))
  if (!module) {
    throw new Error(`Unknown test module ${url}`)
  }
  return module
}

const dataUrl = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`

const stubsKey = '__startCompilerTestStubs'
const stubRegistry: Array<Record<string, unknown>> = ((
  globalThis as Record<string, unknown>
)[stubsKey] ??= []) as Array<Record<string, unknown>>

/** Source of a module exporting `names` read from a registered object. */
function objectModule(object: Record<string, unknown>, names: Set<string>) {
  const index = stubRegistry.push(object) - 1
  const lines = [`const stub = globalThis.${stubsKey}[${index}]`]
  let local = 0
  for (const name of names) {
    const binding = `_${local++}`
    lines.push(`const ${binding} = stub[${JSON.stringify(name)}]`)
    lines.push(`export { ${binding} as ${JSON.stringify(name)} }`)
  }
  return lines.join('\n')
}

export type Node = { type: string; [key: string]: unknown }

export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/** The static value of a module specifier expression, if any. */
export function staticSpecifier(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (
    node.type === 'TemplateLiteral' &&
    (node.expressions as Array<unknown>).length === 0
  ) {
    const [quasi] = node.quasis as Array<{ value: { cooked: string } }>
    return quasi!.value.cooked
  }
  return undefined
}

export function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit)
    }
    return
  }
  if (!isNode(node)) {
    return
  }
  visit(node)
  for (const key in node) {
    if (key !== 'type') {
      walk(node[key], visit)
    }
  }
}

/** Name an import or export specifier refers to. */
function specifierName(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  return node.type === 'Identifier'
    ? (node.name as string)
    : (node.value as string)
}

export interface ModuleRequests {
  /** Source of each import and re-export declaration, in source order. */
  declarations: Array<string>
  /** Specifiers of static imports and re-exports, unique, in source order. */
  static: Array<string>
  /** Static specifiers of dynamic `import()` calls, in source order. */
  dynamic: Array<string>
  /** Names imported or re-exported from each static specifier. */
  names: Map<string, Set<string>>
}

/**
 * Parses a module as TypeScript with JSX, or else as TypeScript (where
 * `<T>value` is a type assertion).
 */
export function parseModule(code: string): ESTree.Program {
  const tsx = parseSync('module.tsx', code, { sourceType: 'module' })
  if (tsx.errors.length === 0) {
    return tsx.program
  }
  const ts = parseSync('module.ts', code, { sourceType: 'module' })
  if (ts.errors.length === 0) {
    return ts.program
  }
  throw new Error(`Cannot parse module: ${tsx.errors[0]!.message}\n${code}`)
}

/** The modules a JavaScript or TypeScript (JSX) module requests. */
export function moduleRequests(code: string) {
  const program = parseModule(code)
  const requests: ModuleRequests = {
    declarations: [],
    static: [],
    dynamic: [],
    names: new Map(),
  }
  const declare = (specifier: string) => {
    requests.declarations.push(specifier)
    request(specifier)
  }
  const request = (specifier: string, name?: string) => {
    if (!requests.names.has(specifier)) {
      requests.static.push(specifier)
      requests.names.set(specifier, new Set())
    }
    if (name !== undefined) {
      requests.names.get(specifier)!.add(name)
    }
  }
  walk(program, (node) => {
    switch (node.type) {
      case 'ImportDeclaration': {
        const source = staticSpecifier(node.source)!
        declare(source)
        for (const specifier of node.specifiers as Array<Node>) {
          if (specifier.type === 'ImportDefaultSpecifier') {
            request(source, 'default')
          } else if (specifier.type === 'ImportSpecifier') {
            request(source, specifierName(specifier.imported))
          }
        }
        break
      }
      case 'ExportNamedDeclaration': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          declare(source)
          for (const specifier of node.specifiers as Array<Node>) {
            request(source, specifierName(specifier.local))
          }
        }
        break
      }
      case 'ExportAllDeclaration':
        declare(staticSpecifier(node.source)!)
        break
      case 'ImportExpression': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          requests.dynamic.push(source)
        }
        break
      }
    }
  })
  return requests
}

const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json']

/**
 * A graph of in-memory modules. Each graph evaluates its own instances: a
 * module imported twice from one graph is evaluated once, like in a bundle.
 */
export function createModuleGraph(options: ModuleGraphOptions = {}) {
  const graph = String(globalState.next++)
  const state: GraphState = { modules: new Map() }
  globalState.graphs.set(graph, state)
  const sources = new Map(Object.entries(options.modules ?? {}))
  const stubs = options.stubs ?? {}
  const preparing = new Map<
    string,
    Promise<Array<{ id: string; dynamic: boolean }>>
  >()

  /** Project module id a specifier names, if the graph has that module. */
  const resolveProjectModule = async (specifier: string, importer: string) => {
    if (!specifier.startsWith('/') && !specifier.startsWith('.')) {
      return undefined
    }
    const [, file, query] = /^([^?#]*)(.*)$/s.exec(specifier) as unknown as [
      string,
      string,
      string,
    ]
    const absolute = file.startsWith('/')
      ? file
      : path.posix.join(
          path.posix.dirname(importer.replace(/[?#].*$/, '')),
          file,
        )
    for (const extension of extensions) {
      const id = `${absolute}${extension}${query}`
      if (sources.has(id)) {
        return id
      }
      const loaded = await options.load?.(id)
      if (loaded !== null && loaded !== undefined) {
        sources.set(id, loaded)
        return id
      }
    }
    return undefined
  }

  const prepareStub = (
    specifier: string,
    stub: ModuleStub,
    names: Set<string>,
  ) => {
    const id = `\0stub:${specifier}`
    if (typeof stub === 'string') {
      if (!state.modules.has(id)) {
        state.modules.set(id, {
          format: specifier.endsWith('.json') ? 'json' : 'module',
          source: stub,
          imports: new Map(),
        })
      }
      return moduleUrl(graph, id)
    }
    // An object stub exports `default` and its own keys, and in a lenient
    // graph any name its importer asks for; each importer gets its own
    // instance then.
    const exported = new Set(['default', ...Object.keys(stub)])
    let key = id
    if (options.lenient) {
      for (const name of names) {
        exported.add(name)
      }
      key = `${id}#${[...exported].sort().join(',')}`
    }
    if (!state.modules.has(key)) {
      state.modules.set(key, {
        format: 'module',
        source: objectModule(stub, exported),
        imports: new Map(),
      })
    }
    return moduleUrl(graph, key)
  }

  /**
   * Prepares a module and returns the project modules it imports, statically
   * or dynamically.
   */
  const prepareModule = (id: string) => {
    let prepared = preparing.get(id)
    if (!prepared) {
      prepared = (async () => {
        const code = sources.get(id)
        if (code === undefined) {
          throw new Error(`No module ${id}`)
        }
        const { code: javascript } = await transformWithOxc(
          code,
          'module.tsx',
          {
            jsx: {
              runtime: 'classic',
              pragma: '__jsx',
              pragmaFrag: '__Fragment',
            },
          },
        )
        const module: PreparedModule = {
          format: 'module',
          source: `${options.runtime ?? ''}${javascript}`,
          imports: new Map(),
        }
        state.modules.set(id, module)
        const requests = moduleRequests(javascript)
        const dependencies: Array<{ id: string; dynamic: boolean }> = []
        const resolve = async (specifier: string, required: boolean) => {
          if (module.imports.has(specifier)) {
            return
          }
          const stub = stubs[specifier]
          if (stub !== undefined) {
            module.imports.set(
              specifier,
              prepareStub(
                specifier,
                stub,
                requests.names.get(specifier) ?? new Set(),
              ),
            )
            return
          }
          let target: string | undefined
          try {
            target = await resolveProjectModule(specifier, id)
          } catch (error) {
            if (required) {
              throw error
            }
            // Loading a dynamically imported module failed: the import
            // fails when it runs.
            const failed = `\0failed:${id}:${specifier}`
            state.modules.set(failed, {
              format: 'module',
              source: '',
              imports: new Map(),
              failure: error,
            })
            module.imports.set(specifier, moduleUrl(graph, failed))
            return
          }
          if (target !== undefined) {
            module.imports.set(specifier, moduleUrl(graph, target))
            dependencies.push({ id: target, dynamic: !required })
            return
          }
          if (options.lenient) {
            module.imports.set(
              specifier,
              prepareStub(
                specifier,
                {},
                requests.names.get(specifier) ?? new Set(),
              ),
            )
            return
          }
          if (required) {
            throw new Error(`No stub for import ${specifier}`)
          }
        }
        for (const specifier of requests.static) {
          await resolve(specifier, true)
        }
        // A dynamic import fails when it runs if the graph cannot resolve it.
        for (const specifier of requests.dynamic) {
          await resolve(specifier, false)
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
        state.modules.set(item.id, {
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
    /** Adds a project module to the graph. */
    add(id: string, code: string) {
      if (sources.has(id) && sources.get(id) !== code) {
        throw new Error(`Module ${id} is already in the graph`)
      }
      sources.set(id, code)
    },
    /** Id of the project module with this source, if the graph loaded it. */
    idOf(code: string) {
      for (const [id, source] of sources) {
        if (source === code) {
          return id
        }
      }
      return undefined
    },
    /** Evaluates a module of the graph (once) and returns its namespace. */
    async import(id: string): Promise<Record<string, any>> {
      await prepare(id)
      const entry = await import(
        /* @vite-ignore */ dataUrl(
          `import * as namespace from ${JSON.stringify(moduleUrl(graph, id))}\nexport { namespace }`,
        )
      )
      return entry.namespace
    },
  }
}

export type ModuleGraph = ReturnType<typeof createModuleGraph>
