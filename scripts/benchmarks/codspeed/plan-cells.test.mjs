import assert from 'node:assert/strict'
import test from 'node:test'
import { CELLS, selectCells } from './plan-cells.mjs'

const key = ({ benchmark, framework }) => `${benchmark}:${framework}`
const cellsOf = (...benchmarks) =>
  CELLS.filter((cell) => benchmarks.includes(cell.benchmark)).map(key)
const cellProjects = Object.fromEntries(
  CELLS.map((cell) => [
    key(cell),
    [`@tanstack/${cell.framework}-router`, `${key(cell)}-only-package`],
  ]),
)
const select = (changedFiles, affectedProjects = []) =>
  selectCells({ changedFiles, affectedProjects, cellProjects }).map(key)

test('selects cells that build a package Nx reports as affected', () => {
  assert.deepEqual(
    select(['packages/x/src/index.ts'], ['@tanstack/solid-router']),
    [
      'client-nav:solid',
      'ssr:solid',
      'memory-server:solid',
      'memory-client:solid',
    ],
  )
  assert.deepEqual(select(['packages/x/a.ts'], ['ssr:vue-only-package']), [
    'ssr:vue',
  ])
})

test('selects every framework of the benchmarks a benchmark file can reach', () => {
  assert.deepEqual(
    select(['benchmarks/client-nav/scenarios/hydration/react/fixture.ts']),
    cellsOf('client-nav'),
  )
  assert.deepEqual(
    select(['benchmarks/memory/runtime.ts']),
    cellsOf('memory-server', 'memory-client'),
  )
  assert.deepEqual(select(['benchmarks/cpu-simulation.ts']), CELLS.map(key))
})

test('ignores docs and bundle-size, runs everything for other files', () => {
  assert.deepEqual(
    select([
      'docs/a.json',
      'e2e/b.ts',
      '.changeset/c.md',
      'benchmarks/bundle-size/d.ts',
    ]),
    [],
  )
  for (const file of ['pnpm-lock.yaml', 'scripts/a.mjs', 'benchmarks/b/c.ts']) {
    assert.deepEqual(select([file]), CELLS.map(key), file)
  }
})
