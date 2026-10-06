/**
 * Scenarios ported from babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * MIT) that main's code splitter gets wrong and the Yuku compiler gets right.
 */
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getModuleErrors } from './validate-module'

const filename = 'route.tsx'
const head = `import { createFileRoute } from '@tanstack/react-router'\n`

function compileReferenceAndComponent(code: string) {
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
  })!.code
  const component = compileCodeSplitVirtualRoute({
    code,
    filename: `${filename}?tsr-split=component`,
    splitTargets: ['component'],
  }).code
  return { reference, component }
}

describe('ported babel-dead-code-elimination: fixed by the Yuku compiler', () => {
  // Source: dead-code-elimination.test.ts "object pattern" > "unzips if all
  // variables are unused" and "array pattern" > "unzips if all variables are
  // unused". Main deletes every declaration with an empty pattern, together
  // with its initializer, although nothing was removed from it.
  it('keeps the initializers of empty destructuring patterns in the reference module', async () => {
    const { reference, component } =
      compileReferenceAndComponent(`${head}import { init, other } from './init'
const {} = init()
const [] = other()
const { a: {} } = init()
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`)
    expect(reference.match(/\binit\(\)/g)).toHaveLength(2)
    expect(reference).toContain('other()')
    expect(component).not.toContain('./init')
    expect(await getModuleErrors(reference)).toEqual([])
  })

  // Source: dead-code-elimination.test.ts "function" > "declaration" and
  // "variable" > "identifier". Main keeps TypeScript overloads and redeclared
  // vars that only the split component uses in the reference module, so their
  // imports stay in the main bundle and the redeclared initializers run twice.
  it.each([
    {
      name: 'an overloaded function',
      declarations: `function load(id: string): string
function load(id: number): string
function load(id: any) { return lib.x(id) }`,
      render: '{load(1)}',
    },
    {
      name: 'a redeclared var',
      declarations: `var load = lib.a()
var load = lib.b()`,
      render: '{load}',
    },
  ])(
    'moves $name used only by the split component out of the reference module',
    async ({ declarations, render }) => {
      const { reference, component } =
        compileReferenceAndComponent(`${head}import { lib } from './lib'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>${render}</p>,
})
`)
      expect(reference).not.toContain('./lib')
      expect(reference).not.toMatch(/\bload\b/)
      expect(component).toContain('./lib')
      expect(await getModuleErrors(reference)).toEqual([])
      expect(await getModuleErrors(component)).toEqual([])
    },
  )
})
