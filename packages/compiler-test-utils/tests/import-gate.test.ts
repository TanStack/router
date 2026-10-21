/**
 * Control of the import gate (src/import-gate.ts) on the real workspace and
 * the real `exports` maps: files planted in memory next to the real tests
 * import compiler packages through public and internal paths, and the gate
 * flags exactly the internal ones.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { findImportViolations } from '../src/import-gate'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const routerPluginTests = path.join(root, 'packages/router-plugin/tests')
const plantedTest = path.join(routerPluginTests, 'import-gate-planted.test.ts')
const plantedHelper = path.join(
  routerPluginTests,
  'import-gate-planted-helper.ts',
)
const plantedOutside = path.join(
  routerPluginTests,
  'outside-compiler-corpus/import-gate-planted.test.ts',
)

const files = {
  [plantedTest]: `import { tanstackRouter } from '../src/vite'
import { tanstackRouter as viaPackage } from '@tanstack/router-plugin/vite'
import { getConfig } from '@tanstack/router-plugin'
import type { Config } from '../src/core/config'
import { getConfig as internalGetConfig } from '../src/core/config'
import type { CodeSplitGroupings } from '../src/core/constants'
import { configSchema } from '@tanstack/router-plugin/src/core/config'
import { planted } from './import-gate-planted-helper'

vi.mock('../src/core/hmr', () => ({}))
export const lazy = () => import('../src/core/constants')
export const used = [tanstackRouter, viaPackage, getConfig, internalGetConfig, configSchema, planted]
export type Used = [Config, CodeSplitGroupings]
`,
  [plantedHelper]: `import { tanStackStartVite } from '@tanstack/start-plugin-core/vite'
import { StartCompiler } from '../../start-plugin-core/src/start-compiler/compiler'

export const planted = [tanStackStartVite, StartCompiler]
`,
  [plantedOutside]: `import { StartCompiler } from '../../../start-plugin-core/src/start-compiler/compiler'

export const outside = StartCompiler
`,
}

const relative = (file: string) =>
  path.relative(root, file).split(path.sep).join('/')

describe('the import gate', () => {
  const result = findImportViolations({ root, files })
  const planted = (list: typeof result.violations) =>
    list
      .filter((entry) =>
        [relative(plantedTest), relative(plantedHelper)].includes(entry.file),
      )
      .map(
        (entry) => `${entry.file}:${entry.line} ${entry.kind} ${entry.request}`,
      )

  test('flags every planted internal import, in a test and in its helper', () => {
    expect(planted(result.violations)).toEqual([
      `${relative(plantedHelper)}:2 import ../../start-plugin-core/src/start-compiler/compiler`,
      `${relative(plantedTest)}:5 import ../src/core/config`,
      `${relative(plantedTest)}:6 import ../src/core/constants`,
      `${relative(plantedTest)}:7 import @tanstack/router-plugin/src/core/config`,
      `${relative(plantedTest)}:10 vi.mock ../src/core/hmr`,
      `${relative(plantedTest)}:11 import() ../src/core/constants`,
    ])
  })

  test('allows the public specifiers and the source files of public exports', () => {
    const flaggedLines = (file: string) =>
      result.violations
        .filter((entry) => entry.file === relative(file))
        .map((entry) => entry.line)
    // The test's lines 1-3 and 8, and the helper's line 1, are public.
    expect(flaggedLines(plantedTest)).toEqual([5, 6, 7, 10, 11])
    expect(flaggedLines(plantedHelper)).toEqual([2])
  })

  test('allows a type-only import of a public type through an internal path, and lists it', () => {
    expect(planted(result.publicTypesByPath)).toEqual([
      `${relative(plantedTest)}:4 import ../src/core/config`,
    ])
  })

  test('scans the helper as used by the planted test, and skips implementation tests', () => {
    expect(result.acceptanceFiles).toContain(relative(plantedTest))
    expect(result.acceptanceFiles).not.toContain(relative(plantedOutside))
    expect(result.usersOf[relative(plantedHelper)]).toEqual([
      relative(plantedTest),
    ])
    expect(
      result.violations.some(
        (entry) => entry.file === relative(plantedOutside),
      ),
    ).toBe(false)
  })
})
