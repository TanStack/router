/**
 * Real importers and behavioural probes instead of inventories (SPEC G9,
 * §5.3, §5.6). A compiled module's export list, import list
 * and generated names are free; what is observable is what a real importer
 * gets (the same value and the same instance the module itself uses) and
 * which modules actually load.
 *
 * API:
 * - `importerSource(specifier, names)`: the source of a module that
 *   imports `names` from `specifier` (named, `default`, or names that are
 *   not identifiers) and exports them as live getters on `bindings`. Write
 *   it into a real app (a build entry, a dev-server module).
 * - `loadMarker(name)`: a statement that records `name` when the module it
 *   is in evaluates; put it in a stub or a fixture file.
 *   `resetLoadedModules()` clears the records of this realm;
 *   `loadedModulesExpression` reads them in any realm (a child Node run, a
 *   browser page).
 * - `expectNotLoaded(loaded, forbidden)`: asserts no forbidden module is
 *   in a list of loaded modules (a page's records, module ids).
 */
import { expect } from 'vitest'

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

/** Clears the records of `loadMarker` in this realm. */
export function resetLoadedModules() {
  records().length = 0
}

/**
 * Asserts that none of `forbidden` is in `loaded` (names recorded by
 * `loadMarker`, or module ids).
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
