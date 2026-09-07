import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { TSESLint } from '@typescript-eslint/utils'
import { afterEach, assert, expect, test } from 'vitest'
import { rule as serverRule } from '../rules/no-client-code-in-server-component/no-client-code-in-server-component.rule'
import { rule as asyncRule } from '../rules/no-async-client-component/no-async-client-component.rule'

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
    return { messages }
  }
}

test.each(['callback', 'jsx'])(
  'reports violations in each server %s without reporting unrelated client code',
  (kind) => {
    const outside =
      'function Client() { useEffect(); return <button onClick={() => {}} /> }'
    const roots = Array.from({ length: 3 }, (_, i) => {
      const jsx = `<button onClick={() => {}}>${i}</button>`
      return kind === 'callback'
        ? `createCompositeComponent(({ value = window.location }) => ${jsx});`
        : `renderServerComponent(${jsx});`
    })
    const result = createLint({ 'roots.tsx': [outside, ...roots].join('\n') })(
      serverRule,
    )
    expect(result.messages.map((message) => message.messageId)).toEqual([
      'eventHandlerInServerComponent',
      'eventHandlerInServerComponent',
      'eventHandlerInServerComponent',
    ])
  },
)

test('reports the same diagnostics when linting separate routes again', () => {
  const files = Object.fromEntries(
    ['first', 'second'].map((name) => [
      `${name}.tsx`,
      `
        function Page() { return <Panel /> }
        function Panel() { return <Leaf /> }
        async function Leaf() { return <span /> }
        export const Route = createFileRoute('/${name}')({ component: Page });
      `,
    ]),
  )
  const lint = createLint(files)
  const first = lint(asyncRule)
  expect(first.messages.map((message) => message.messageId)).toEqual([
    'asyncClientComponentUsage',
    'asyncClientComponentDefinition',
    'asyncClientComponentUsage',
    'asyncClientComponentDefinition',
  ])
  expect(lint(asyncRule).messages).toEqual(first.messages)
})

test.each([false, true])(
  'reports diagnostics through duplicate edges, diamonds, and cycles (unreachable edges: %s)',
  (unreachableEdges) => {
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
  },
)
