/**
 * Control of the import gate (src/import-gate.ts) on a fixture workspace: a
 * temporary directory with compiler packages of their own (`package.json`
 * with an `exports` map, and the sources it is built from), and files
 * planted in memory next to their tests that import them through public
 * and internal paths. The gate flags exactly the internal ones. Nothing here
 * depends on where the real packages keep their sources (FINAL-PASS #51:
 * a restructure of a real package's internals must not move the control).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { findImportViolations } from '../src/import-gate'

/** The built entries of an `exports` map entry (ESM, with types). */
const built = (file: string) => ({
  import: {
    types: `./dist/esm/${file}.d.ts`,
    default: `./dist/esm/${file}.js`,
  },
})

/** The fixture workspace's packages: manifests and sources. */
const fixture: Record<string, string> = {
  'packages/router-plugin/package.json': JSON.stringify({
    name: '@tanstack/router-plugin',
    exports: {
      '.': built('index'),
      './vite': built('vite'),
      './package.json': './package.json',
    },
  }),
  'packages/router-plugin/src/index.ts': `export { getConfig } from './core/config'
export type { Config } from './core/config'
`,
  'packages/router-plugin/src/vite.ts': `export const tanstackRouter = () => ({ name: 'fixture' })\n`,
  'packages/router-plugin/src/core/config.ts': `export interface Config {
  target: string
}
export const getConfig = (): Config => ({ target: 'react' })
export const configSchema = {}
`,
  'packages/router-plugin/src/core/constants.ts': `export type CodeSplitGroupings = Array<Array<string>>\n`,
  'packages/router-plugin/src/core/hmr.ts': `export const hmr = true\n`,
  'packages/start-plugin-core/package.json': JSON.stringify({
    name: '@tanstack/start-plugin-core',
    exports: { './vite': built('vite/index') },
  }),
  'packages/start-plugin-core/src/vite/index.ts': `export const tanStackStartVite = () => ({ name: 'fixture' })\n`,
  'packages/start-plugin-core/src/start-compiler/compiler.ts': `export class StartCompiler {}\n`,
  'packages/compiler-test-utils/package.json': JSON.stringify({
    name: '@tanstack/compiler-test-utils',
    exports: {},
  }),
}

const root = mkdtempSync(path.join(os.tmpdir(), 'import-gate-fixture-'))
for (const [file, code] of Object.entries(fixture)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), code)
}
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

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

test('the noncompiler lanes are excluded while fast and integration acceptance stay gated', () => {
  const paths = [
    'react-start-rsc/tests/compiler-planted.test.ts',
    'react-start-rsc/tests/integration/compiler-planted.test.ts',
    'react-start-rsc/tests/outside-compiler-corpus/noncompiler/runtime-planted.test.tsx',
    'start-plugin-core/tests/outside-compiler-corpus/noncompiler/plumbing-planted.test.ts',
  ].map((file) => path.join(root, 'packages', file))
  const result = findImportViolations({
    root,
    files: Object.fromEntries(
      paths.map((file) => [
        file,
        `import { StartCompiler } from '@tanstack/start-plugin-core/src/start-compiler/compiler'`,
      ]),
    ),
  })
  expect(
    result.acceptanceFiles.filter((file) => file.includes('-planted.test.')),
  ).toEqual(paths.slice(0, 2).map(relative))
  expect(
    result.violations
      .filter(({ file }) => file.includes('-planted.test.'))
      .map(({ file }) => file),
  ).toEqual(paths.slice(0, 2).map(relative))
})
