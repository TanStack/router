/**
 * Controls of the importer and load probes (importers.ts): an importer is
 * a plain module any real app can contain, and load markers record the
 * modules that evaluated in any realm.
 */
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'
import { loadMarker, loadedModulesExpression } from '../src/importers'

describe('load markers', () => {
  test('loadedModulesExpression reads the records in any realm', () => {
    // A realm of its own: the records stay out of the test process's
    const realm = vm.createContext()
    const read = () => [...vm.runInContext(loadedModulesExpression, realm)]
    expect(read()).toEqual([])
    vm.runInContext(loadMarker('x'), realm)
    expect(read()).toEqual(['x'])
  })
})
