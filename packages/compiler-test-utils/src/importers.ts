/**
 * Real importers and behavioural probes instead of inventories (FIX-PLAN
 * A10; SPEC G9, §5.3, §5.6). A compiled module's export list, import list
 * and generated names are free; what is observable is what a real importer
 * gets (the same value and the same instance the module itself uses) and
 * which modules actually load.
 *
 * API:
 * - `importerSource(specifier, names)`: the source of a module that
 *   imports `names` from `specifier` (named, `default`, or names that are
 *   not identifiers) and exports them as live getters on `bindings`. Write
 *   it into a real app (a build entry, a dev-server module) or add it to a
 *   module graph.
 * - `importBindings(graph, specifier, names, options?)`: adds such a module
 *   to a `createModuleGraph` graph, evaluates it and returns its live
 *   `bindings`: compare them (`toBe`) with what the module uses, call them.
 * - `loadMarker(name)`: a statement that records `name` when the module it
 *   is in evaluates; put it in a stub or a fixture file. `loadedModules()`
 *   and `resetLoadedModules()` read and clear the records of this realm;
 *   `loadedModulesExpression` reads them in another realm (a child Node
 *   run, a browser page).
 * - `expectNotLoaded(loaded, forbidden)`: asserts no forbidden module is
 *   in a list of loaded modules (`loadedModules()`, `graph.evaluated`).
 */
import { expect } from 'vitest'
import type { ModuleGraph } from './module-linker'

const identifier = /^[A-Za-z_$][\w$]*$/

/**
 * The source of a module importing `names` from `specifier` and exporting
 * them, live, as getters of `bindings` (`bindings.default` for the default
 * export).
 */
export function importerSource(specifier: string, names: Array<string>) {
  const quoted = JSON.stringify(specifier)
  const local = (index: number) => `__imported${index}`
  const imports = names.map((name, index) =>
    name === 'default'
      ? `import ${local(index)} from ${quoted}`
      : `import { ${identifier.test(name) ? name : JSON.stringify(name)} as ${local(index)} } from ${quoted}`,
  )
  const getters = names.map(
    (name, index) =>
      `  get ${JSON.stringify(name)}() { return ${local(index)} },`,
  )
  return `${imports.join('\n')}
export const bindings = {
${getters.join('\n')}
}
`
}

let importers = 0

/**
 * Adds a module importing `names` from `specifier` to `graph` (as
 * `options.id`, by default a fresh `/importer-<n>.ts`), evaluates it and
 * returns its live bindings. `specifier` resolves as the graph resolves
 * imports of a module at `options.id`.
 */
export async function importBindings(
  graph: ModuleGraph,
  specifier: string,
  names: Array<string>,
  options: { id?: string } = {},
): Promise<Record<string, any>> {
  const id = options.id ?? `/importer-${++importers}.ts`
  graph.add(id, importerSource(specifier, names))
  const { bindings } = await graph.import(id)
  return bindings as Record<string, any>
}

const loadedKey = 'tanstack.compiler-test-utils.loaded'

/**
 * An expression evaluating to the names `loadMarker` recorded in its realm,
 * in load order (an empty array when none).
 */
export const loadedModulesExpression = `(globalThis[Symbol.for(${JSON.stringify(loadedKey)})] ?? [])`

/**
 * A statement recording `name` in its realm when the module containing it
 * evaluates. Valid in any JavaScript or TypeScript module.
 */
export function loadMarker(name: string) {
  return `;(globalThis[Symbol.for(${JSON.stringify(loadedKey)})] ??= []).push(${JSON.stringify(name)});\n`
}

function records(): Array<string> {
  const global = globalThis as unknown as Record<symbol, Array<string>>
  return (global[Symbol.for(loadedKey)] ??= [])
}

/** The names `loadMarker` recorded in this realm, in load order. */
export function loadedModules(): Array<string> {
  return [...records()]
}

/** Clears the records of `loadMarker` in this realm. */
export function resetLoadedModules() {
  records().length = 0
}

/**
 * Asserts that none of `forbidden` is in `loaded` (names recorded by
 * `loadMarker`, or module ids such as `graph.evaluated`).
 */
export function expectNotLoaded(
  loaded: ReadonlyArray<string>,
  forbidden: Array<string>,
) {
  expect(
    forbidden.filter((name) => loaded.includes(name)),
    'forbidden modules that loaded',
  ).toEqual([])
}
