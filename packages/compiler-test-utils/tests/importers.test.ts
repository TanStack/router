/**
 * Controls of the importer and load probes (importers.ts): an importer is
 * a plain module any real app can contain, and load markers record the
 * modules that evaluated in any realm.
 */
import { describe, expect, test } from 'vitest'
import { loadMarker, loadedModulesExpression } from '../src/importers'

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
