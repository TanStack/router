import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { TSESLint } from '@typescript-eslint/utils'
import { afterEach, assert, expect, test, vi } from 'vitest'
import { rule as serverRule } from '../rules/no-client-code-in-server-component/no-client-code-in-server-component.rule'
import { rule as asyncRule } from '../rules/no-async-client-component/no-async-client-component.rule'
import * as contextAnalyzer from '../rules/no-async-client-component/context-analyzer'
import type * as violationDetector from '../rules/no-client-code-in-server-component/violation-detector'
import type * as renderGraphBuilder from '../rules/no-async-client-component/render-graph-builder'
import type * as ts from 'typescript'

const counts = vi.hoisted(() => ({ detectorNodes: 0, edgeReads: 0, builds: 0 }))

// Count work in the real detector and graph builder, without timing assertions.
vi.mock(
  '../rules/no-client-code-in-server-component/violation-detector',
  async (importOriginal) => {
    const original = await importOriginal<typeof violationDetector>()
    return {
      ...original,
      createViolationDetector(
        tsLib: typeof ts,
        options: Parameters<typeof original.createViolationDetector>[1],
      ) {
        return original.createViolationDetector(
          {
            ...tsLib,
            forEachChild(node, cbNode, cbNodes) {
              counts.detectorNodes++
              return tsLib.forEachChild(node, cbNode, cbNodes)
            },
          },
          options,
        )
      },
    }
  },
)

vi.mock(
  '../rules/no-async-client-component/render-graph-builder',
  async (importOriginal) => {
    const original = await importOriginal<typeof renderGraphBuilder>()
    return {
      ...original,
      createRenderGraphBuilder(
        ...args: Parameters<typeof original.createRenderGraphBuilder>
      ) {
        const builder = original.createRenderGraphBuilder(...args)
        const graph = builder.getGraph()
        graph.edges = new Proxy(graph.edges, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) {
              counts.edgeReads++
            }
            return Reflect.get(target, key, receiver)
          },
        })
        return {
          ...builder,
          build() {
            counts.builds++
            return builder.build()
          },
        }
      },
    }
  },
)

const directories: Array<string> = []
afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true })
  }
  directories.length = 0
})

function createLint(files: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), 'start-eslint-'))
  directories.push(directory)
  for (const [name, code] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), code)
  }
  writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { jsx: 'preserve', noLib: true, types: [] },
      files: Object.keys(files),
    }),
  )
  const linter = new TSESLint.Linter({ cwd: directory })
  return (rule: TSESLint.AnyRuleModule, names = Object.keys(files)) => {
    counts.detectorNodes = 0
    counts.edgeReads = 0
    counts.builds = 0
    const messages = names.flatMap((name) => {
      const code = files[name]
      assert.isDefined(code)
      return linter.verify(
        code,
        [
          {
            files: ['**/*.tsx'],
            languageOptions: {
              parser: RuleTester.getDefaultConfig().languageOptions?.parser,
              parserOptions: {
                disallowAutomaticSingleRunInference: true,
                projectService: true,
                tsconfigRootDir: directory,
              },
            },
            plugins: { test: { rules: { check: rule } } },
            rules: { 'test/check': 'error' },
          },
        ],
        { filename: path.join(directory, name) },
      )
    })
    expect(messages.filter((message) => message.fatal)).toEqual([])
    return { ...counts, messages }
  }
}

test.each(['callback', 'jsx'])(
  'direct %s checks scale with server roots without rescanning unrelated code',
  (kind) => {
    function lintRoots(count: number) {
      const outside = `function Client() { useEffect(); return <button onClick={() => {}} /> }`
      const roots = Array.from({ length: count }, (_, i) => {
        const jsx = `<button onClick={() => {}}>${i}</button>`
        return kind === 'callback'
          ? `createCompositeComponent(({ value = window.location }) => ${jsx});`
          : `renderServerComponent(${jsx});`
      })
      return createLint({ 'roots.tsx': [outside, ...roots].join('\n') })(
        serverRule,
      )
    }

    const small = lintRoots(8)
    const large = lintRoots(32)
    expect(small.messages).toHaveLength(8)
    expect(large.messages.map((message) => message.messageId)).toEqual(
      Array(32).fill('eventHandlerInServerComponent'),
    )
    expect(large.detectorNodes).toBeGreaterThan(0)
    expect(large.detectorNodes).toBeLessThanOrEqual(small.detectorNodes * 5)
  },
)

test('slicing separate route graphs scales with reachable edges and reuses cached analysis', () => {
  function lintRoutes(count: number) {
    const files = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `route-${i}.tsx`,
        `
          function Page() { return <Panel /> }
          function Panel() { return <Leaf /> }
          async function Leaf() { return <span /> }
          export const Route = createFileRoute('/${i}')({ component: Page });
        `,
      ]),
    )
    const lint = createLint(files)
    const cold = lint(asyncRule)
    const warm = lint(asyncRule)
    expect(warm.messages).toEqual(cold.messages)
    expect(cold.builds).toBe(1)
    expect(warm.builds).toBe(0)
    expect(warm.edgeReads).toBe(0)
    expect(cold.messages).toHaveLength(count * 2)
    return cold
  }

  const small = lintRoutes(8)
  const large = lintRoutes(32)
  expect(large.edgeReads).toBeGreaterThan(0)
  expect(large.edgeReads).toBeLessThanOrEqual(small.edgeReads * 5)
})

test.each([false, true])(
  'slicing preserves traversal and JSX edge order through duplicate edges, diamonds, and cycles (unreachable edges: %s)',
  (unreachableEdges) => {
    const analyze = vi.spyOn(contextAnalyzer, 'analyzeContext')
    const lint = createLint({
      'route.tsx': `
      function Page() { return <><Left /><Right /><Left /></> }
      function Left() { return <Leaf /> }
      function Right() { return <Leaf /> }
      async function Leaf() { return <Page /> }
      export const Route = createFileRoute('/')({ component: Page });
    `,
      ...(unreachableEdges
        ? {
            'unrelated.tsx': `
      'use client';
      function Unrelated() { return <Other /> }
      async function Other() { return <span /> }
    `,
          }
        : {}),
    })
    const result = lint(asyncRule, ['route.tsx'])
    expect(result.messages.map((message) => message.messageId)).toEqual([
      'asyncClientComponentUsage',
      'asyncClientComponentUsage',
      'asyncClientComponentDefinition',
    ])
    const [call] = analyze.mock.calls
    assert.isDefined(call)
    const [graph] = call
    expect(
      [...graph.components.values()].map((component) => component.name),
    ).toEqual(['Page', 'Right', 'Leaf', 'Left'])
    expect(
      graph.edges.map((edge) => [edge.fromComponent, edge.toComponent]),
    ).toEqual([
      ['Page', 'Left'],
      ['Page', 'Right'],
      ['Page', 'Left'],
      ['Left', 'Leaf'],
      ['Right', 'Leaf'],
      ['Leaf', 'Page'],
    ])
  },
)
