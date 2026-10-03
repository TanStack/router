import { readFileSync } from 'node:fs'
import {
  ScriptTarget,
  createSourceFile,
  isCallExpression,
  isIdentifier,
  transpile,
} from 'typescript'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Node } from 'typescript'

const guide = readFileSync(
  '../../../docs/start/framework/react/guide/isr.md',
  'utf8',
)

// Keep the published recipe tied to the configuration and Worker exercised by
// the HTTP tests, rather than maintaining another untested copy in Markdown.
for (const file of ['vite.config.ts', 'rsbuild.config.ts']) {
  test(`the guide's ${file} uses the tested prerender options`, () => {
    const snippet = guide.match(
      new RegExp('```ts title="' + file + '"\\n([\\s\\S]*?)```'),
    )?.[1]
    expect(snippet).toBeDefined()
    expect(startOptions(snippet!)).toBe(
      startOptions(readFileSync('vite.config.ts', 'utf8')),
    )
  })
}

test('the guide includes the tested Cloudflare server entry', () => {
  const snippet = guide.match(
    /```ts title="src\/server.ts"\n([\s\S]*?)```/,
  )?.[1]
  expect(snippet?.trim()).toBe(readFileSync('src/server.ts', 'utf8').trim())
})

function startOptions(code: string) {
  const source = createSourceFile('config.ts', code, ScriptTarget.Latest, true)
  let options: string | undefined
  function visit(node: Node) {
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      node.expression.text === 'tanstackStart'
    ) {
      options = transpile(
        `const options = ${node.arguments[0].getText(source)}`,
      )
    }
    node.forEachChild(visit)
  }
  visit(source)
  expect(options).toBeDefined()
  return options
}
