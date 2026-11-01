/**
 * Real importers and behavioural probes instead of inventories (SPEC G9,
 * §5.3, §5.6). A compiled module's export list, import list
 * and generated names are free; what is observable is what a real importer
 * gets (the same value and the same instance the module itself uses) and
 * which modules actually load.
 *
 * API:
 * - `loadMarker(name)`: a statement that records `name` when the module it
 *   is in evaluates; put it in a stub or a fixture file.
 *   `loadedModulesExpression` reads the records in any realm (a child Node
 *   run, a browser page).
 * - `expectNotLoaded(loaded, forbidden)`: asserts no forbidden module is
 *   in a list of loaded modules (a page's records, module ids).
 */
import { expect } from 'vitest'

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
