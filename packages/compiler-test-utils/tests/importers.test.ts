/**
 * Controls of the importer and load probes (importers.ts): an importer is
 * a plain module any real app can contain, and load markers record the
 * modules that evaluated in any realm.
 */
import { afterEach, describe, expect, test } from 'vitest'
import {
  importerSource,
  loadMarker,
  loadedModulesExpression,
  resetLoadedModules,
} from '../src/importers'

afterEach(() => {
  resetLoadedModules()
})

describe('importerSource', () => {
  test('is a plain module any real app can contain', () => {
    expect(importerSource('./route', ['Route'])).toContain(`from "./route"`)
  })
})

describe('load markers', () => {
  test('loadedModulesExpression reads the records in any realm', () => {
    const read = new Function(`return ${loadedModulesExpression}`) as () => [
      string,
    ]
    expect(read()).toEqual([])
    new Function(loadMarker('x'))()
    expect(read()).toEqual(['x'])
  })
})
