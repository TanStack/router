import { bench, describe, expect } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitReferenceRouteFromAst,
  computeSharedBindings,
  computeSharedBindingsFromAst,
  detectCodeSplitGroupingsFromAst,
  detectCodeSplitGroupingsFromRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'

// Compare the old three-parse pipeline with the plugin's one-parse pipeline.
// Both use identical sources/options and run all analyses before compilation.
// Each iteration owns fresh ASTs; no cached parse or mutated tree is reused.
function runPipeline(code: string, parseOnce: boolean) {
  const filename = '/src/routes/benchmark.tsx'
  const ast = parseOnce ? parseAst({ code, filename }) : undefined
  const { groupings } = ast
    ? detectCodeSplitGroupingsFromAst(ast)
    : detectCodeSplitGroupingsFromRoute({ code, filename })
  const codeSplitGroupings = groupings ?? defaultCodeSplitGroupings
  const sharedBindings = ast
    ? computeSharedBindingsFromAst(ast, codeSplitGroupings)
    : computeSharedBindings({ code, filename, codeSplitGroupings })
  const opts = {
    code,
    filename,
    id: filename,
    codeSplitGroupings,
    sharedBindings: sharedBindings.size > 0 ? sharedBindings : undefined,
    targetFramework: 'react' as const,
    addHmr: false,
  }
  const result = ast
    ? compileCodeSplitReferenceRouteFromAst(ast, opts)
    : compileCodeSplitReferenceRoute(opts)
  return { groupings, sharedBindings, code: result?.code, map: result?.map }
}

function routeSource(large: boolean, customGroups: boolean, shared: boolean) {
  const helpers = large
    ? Array.from(
        { length: 120 },
        (_, index) => `
function renderField${index}(value: string) {
  const label = value.trim() || 'Field ${index}'
  return <label data-field="${index}"><span>{label}</span><input name="field${index}" defaultValue={value} /></label>
}`,
      ).join('\n')
    : ''
  const fields = large
    ? Array.from(
        { length: 120 },
        (_, index) => `{renderField${index}('Value ${index}')}`,
      ).join('\n')
    : '<span>Small route</span>'
  return `
import { createFileRoute } from '@tanstack/react-router'
${shared ? "const state = { title: 'Shared title' }" : ''}
${helpers}
function Component() {
  return <section><h1>${shared ? '{state.title}' : 'Independent title'}</h1>${fields}</section>
}
const options = {
  ${customGroups ? "codeSplitGroupings: [['component', 'pendingComponent'], ['loader']]," : ''}
  loader: () => ${shared ? 'state.title' : "'Independent data'"},
  component: Component,
  pendingComponent: () => <p>Loading</p>,
}
export const Route = createFileRoute('/benchmark')(options)
`
}

// Run each workload in fresh processes with both AB and BA to check ordering
// sensitivity without changing its inputs or timing settings between runs.
const order = process.env.REFERENCE_BENCH_ORDER ?? 'AB'
if (order !== 'AB' && order !== 'BA') {
  throw new Error('REFERENCE_BENCH_ORDER must be AB or BA')
}

function benchmarkPipeline(name: string, code: string, shared = false) {
  describe(name, () => {
    const baseline = runPipeline(code, false)
    const candidate = runPipeline(code, true)
    expect(candidate).toEqual(baseline)
    expect(candidate.sharedBindings.size > 0).toBe(shared)
    expect(candidate.code).toContain('$$splitComponentImporter')
    expect(candidate.map?.sourcesContent).toEqual([code])

    for (const parseOnce of order === 'AB' ? [false, true] : [true, false]) {
      bench(
        parseOnce ? 'candidate: one parse' : 'baseline: three parses',
        () => {
          runPipeline(code, parseOnce)
        },
        { time: 5000, iterations: 200, warmupTime: 1000 },
      )
    }
  })
}

for (const [name, body] of [
  [
    'imported-component-only',
    `
import Component from './Component'
export const Route = createFileRoute('/benchmark')({ component: Component })`,
  ],
  [
    'inline-component-only',
    `
export const Route = createFileRoute('/benchmark')({ component: () => <div>Page</div> })`,
  ],
  [
    'single-group-local',
    `
const title = 'Page'
function Component() { return <div>{title}</div> }
export const Route = createFileRoute('/benchmark')({ component: Component })`,
  ],
] as const) {
  benchmarkPipeline(
    `tiny/default/${name}`,
    `import { createFileRoute } from '@tanstack/react-router'\n${body}`,
  )
}

for (const large of [false, true]) {
  for (const customGroups of [false, true]) {
    for (const shared of [false, true]) {
      const name = `${large ? 'large-synthetic-declaration-heavy' : 'small'}/${customGroups ? 'custom' : 'default'}/${shared ? 'shared' : 'no-shared'}`
      const code = routeSource(large, customGroups, shared)
      benchmarkPipeline(name, code, shared)
    }
  }
}
