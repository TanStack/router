/**
 * Runs emitted modules with Node's own ES module linker, the way a bundler's
 * output runs: every import and export form links natively (default,
 * namespace, side-effect imports, `export * from`, `export { x } from`, live
 * bindings, cycles), and a dynamic `import()` evaluates its module only when
 * it is called.
 *
 * Modules are served from memory through in-thread module hooks
 * (`module.registerHooks`), under `tsr-module:` URLs that are unique per
 * session, so every session evaluates fresh module instances. JSX compiles to
 * calls of a text renderer: intrinsic elements become tags, components are
 * called.
 */
import { createRequire, registerHooks } from 'node:module'
import { parseSync, transformWithOxc } from 'vite'

/** Exports of a module provided by the test instead of a real module. */
export type ModuleStub = Record<string, unknown>

export type ModuleSessionOptions = {
  /** Source of each module the session can evaluate, by module id. */
  modules: Map<string, string>
  /**
   * Modules provided as values (stubs), by the specifier modules import them
   * with. A stub wins over a module of `modules` with the same specifier.
   */
  stubs?: Record<string, ModuleStub>
  /**
   * Maps an import specifier to the id of a module of `modules`; returns
   * `undefined` when the specifier names no module of the session.
   */
  resolve?: (specifier: string, importer: string) => string | undefined
  /**
   * Stubs a specifier that is neither a stub nor a module of the session,
   * given the names the session's modules import from it. Without it, such
   * an import throws.
   */
  fallbackStub?: (specifier: string, names: Set<string>) => ModuleStub
  /** Properties assigned to `import.meta` of each module before it runs. */
  importMeta?: (id: string) => Record<string, unknown>
  /** Bindings declared at the top of each module (e.g. `$RefreshReg$`). */
  scope?: (id: string) => Record<string, unknown>
  /** Compiles a module to JavaScript; by default TS and JSX are erased. */
  transform?: (code: string, id: string) => Promise<string>
}

export type ModuleSession = {
  /** Imports a module of the session by id, evaluating it and its imports. */
  import: (id: string) => Promise<Record<string, any>>
  /** Ids of the session's modules, in the order they started evaluating. */
  evaluated: Array<string>
}

const scheme = 'tsr-module:'
const registryKey = Symbol.for('tanstack-router-plugin.module-runtime')
const runtimeUrl = `${scheme}//runtime/jsx`

type Session = {
  id: number
  options: ModuleSessionOptions
  /** Compiled source of each served module, by URL. */
  sources: Map<string, string>
  /** Stub exports of each served stub, by URL. */
  stubs: Map<string, ModuleStub>
  /** Names each unresolved specifier is imported with. */
  importedNames: Map<string, Set<string>>
  evaluated: Array<string>
}

type Registry = {
  sessions: Map<number, Session>
  nextSession: number
  hooksRegistered: boolean
  jsx: Record<string, unknown>
}

function getRegistry(): Registry {
  const global = globalThis as unknown as Record<symbol, Registry | undefined>
  global[registryKey] ??= {
    sessions: new Map(),
    nextSession: 0,
    hooksRegistered: false,
    jsx: createJsxRuntime(),
  }
  return global[registryKey]
}

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

/** The JSX factory names compiled modules call. */
export const jsxPragma = { pragma: '__tsrJsx', pragmaFrag: '__tsrFragment' }

function moduleUrl(session: Session, id: string) {
  return `${scheme}//s${session.id}/module/${encodeURIComponent(id)}`
}

function stubUrl(session: Session, specifier: string) {
  return `${scheme}//s${session.id}/stub/${encodeURIComponent(specifier)}`
}

function parseUrl(url: string) {
  const match = /^tsr-module:\/\/s(\d+)\/(module|stub)\/(.*)$/.exec(url)
  if (!match) {
    return undefined
  }
  const session = getRegistry().sessions.get(Number(match[1]))
  if (!session) {
    return undefined
  }
  return {
    session,
    kind: match[2] as 'module' | 'stub',
    id: decodeURIComponent(match[3]!),
  }
}

function resolveInSession(
  session: Session,
  specifier: string,
  importer: string,
) {
  const { options } = session
  if (options.stubs && Object.hasOwn(options.stubs, specifier)) {
    return stubUrl(session, specifier)
  }
  const id = options.resolve?.(specifier, importer)
  if (id !== undefined && options.modules.has(id)) {
    return moduleUrl(session, id)
  }
  if (options.fallbackStub) {
    return stubUrl(session, specifier)
  }
  throw new Error(`no stub for import ${specifier} (imported by ${importer})`)
}

/** A module exporting a snapshot of each property of the stub. */
function stubSource(session: Session, specifier: string, url: string) {
  const { stubs, fallbackStub } = session.options
  const stub =
    stubs && Object.hasOwn(stubs, specifier)
      ? stubs[specifier]!
      : fallbackStub!(
          specifier,
          session.importedNames.get(specifier) ?? new Set(),
        )
  session.stubs.set(url, stub)
  const names = Object.keys(stub)
  const lines = [
    `const stub = globalThis[Symbol.for(${JSON.stringify(registryKey.description)})].sessions.get(${session.id}).stubs.get(${JSON.stringify(url)})`,
  ]
  names.forEach((name, index) => {
    lines.push(
      `const value${index} = stub[${JSON.stringify(name)}]`,
      `export { value${index} as ${JSON.stringify(name)} }`,
    )
  })
  return lines.join('\n')
}

function ensureHooks(registry: Registry) {
  if (registry.hooksRegistered) {
    return
  }
  registry.hooksRegistered = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === runtimeUrl || parseUrl(specifier)) {
        return { url: specifier, shortCircuit: true }
      }
      const parent = context.parentURL ? parseUrl(context.parentURL) : undefined
      if (parent) {
        return {
          url: resolveInSession(parent.session, specifier, parent.id),
          shortCircuit: true,
        }
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url === runtimeUrl) {
        return {
          format: 'module',
          source: `const { h, Fragment } = globalThis[Symbol.for(${JSON.stringify(registryKey.description)})].jsx
export { h as ${jsxPragma.pragma}, Fragment as ${jsxPragma.pragmaFrag} }`,
          shortCircuit: true,
        }
      }
      const parsed = parseUrl(url)
      if (!parsed) {
        return nextLoad(url, context)
      }
      const source =
        parsed.kind === 'stub'
          ? stubSource(parsed.session, parsed.id, url)
          : parsed.session.sources.get(url)
      if (source === undefined) {
        throw new Error(`module ${parsed.id} was not compiled`)
      }
      return { format: 'module', source, shortCircuit: true }
    },
  })
}

/** Language of a module id for Oxc, from its file extension. */
export function moduleLang(id: string) {
  const extension = /\.([cm]?[jt]sx?)(?:\?.*)?$/.exec(id)?.[1] ?? 'tsx'
  if (/^[cm]?ts$/.test(extension)) {
    return 'ts' as const
  }
  if (extension === 'tsx') {
    return 'tsx' as const
  }
  return 'jsx' as const
}

async function defaultTransform(code: string, id: string) {
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: { runtime: 'classic', ...jsxPragma },
  })
  return result.code
}

/** The names a module imports or re-exports from each specifier. */
function collectImportedNames(
  javascript: string,
  record: (specifier: string, name: string) => void,
) {
  const { module } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  for (const statement of module.staticImports) {
    for (const entry of statement.entries) {
      if (entry.importName.kind === 'Name') {
        record(statement.moduleRequest.value, entry.importName.name!)
      } else if (entry.importName.kind === 'Default') {
        record(statement.moduleRequest.value, 'default')
      }
    }
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest && entry.importName.kind === 'Name') {
        record(entry.moduleRequest.value, entry.importName.name!)
      }
    }
  }
}

// Node's own `import()`, which runs the module hooks (Vitest's module runner
// handles the `import()` calls of test files itself).
const nativeImport = createRequire(import.meta.url)('./native-import.cjs') as (
  specifier: string,
) => Promise<Record<string, any>>

/** Creates a session that evaluates `options.modules` linked to each other. */
export async function createModuleSession(
  options: ModuleSessionOptions,
): Promise<ModuleSession> {
  const registry = getRegistry()
  ensureHooks(registry)
  const session: Session = {
    id: registry.nextSession++,
    options,
    sources: new Map(),
    stubs: new Map(),
    importedNames: new Map(),
    evaluated: [],
  }
  const transform = options.transform ?? defaultTransform
  const sessionExpression = `globalThis[Symbol.for(${JSON.stringify(registryKey.description)})].sessions.get(${session.id})`
  for (const [id, code] of options.modules) {
    const javascript = await transform(code, id)
    collectImportedNames(javascript, (specifier, name) => {
      let names = session.importedNames.get(specifier)
      if (!names) {
        names = new Set()
        session.importedNames.set(specifier, names)
      }
      names.add(name)
    })
    const scope = Object.keys(options.scope?.(id) ?? {})
    const prologue = [
      `import { ${jsxPragma.pragma}, ${jsxPragma.pragmaFrag} } from ${JSON.stringify(runtimeUrl)};`,
      ...(scope.length
        ? [
            `const { ${scope.join(', ')} } = ${sessionExpression}.options.scope(${JSON.stringify(id)});`,
          ]
        : []),
      ...(options.importMeta
        ? [
            `Object.assign(import.meta, ${sessionExpression}.options.importMeta(${JSON.stringify(id)}));`,
          ]
        : []),
      `${sessionExpression}.evaluated.push(${JSON.stringify(id)});`,
    ]
    // One line, so that line numbers in stack traces stay those of the module.
    session.sources.set(
      moduleUrl(session, id),
      `${prologue.join(' ')}${javascript}`,
    )
  }
  registry.sessions.set(session.id, session)
  return {
    import: (id) => {
      if (!options.modules.has(id)) {
        throw new Error(`${id} is not a module of the session`)
      }
      return nativeImport(moduleUrl(session, id))
    },
    evaluated: session.evaluated,
  }
}
