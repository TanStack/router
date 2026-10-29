import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { tanstackRouter } from '../../src/vite'
import type { CodeSplitGroupings } from '../build-harness'

const fixture = path.resolve(__dirname, '../test-files/shared-runtime.tsx')

const groupings: Array<{ name: string; groupings: CodeSplitGroupings }> = [
  { name: 'eager loader', groupings: [['component']] },
  { name: 'separate lazy loader', groupings: [['component'], ['loader']] },
  { name: 'combined lazy loader', groupings: [['component', 'loader']] },
]

it.each(groupings)(
  'preserves executable route contracts with $name',
  assertRuntimeContracts,
  30_000,
)

// Bug on main (more in known-bugs-code-splitter.test.ts): shared extraction
// duplicated a named default function declaration, and the route failed to
// build (`Duplicate declaration`).
it('preserves executable route contracts with shared named-default declarations', async () => {
  await assertRuntimeContracts({
    groupings: [['component'], ['loader']],
    syntax: 'named-default',
  })
}, 30_000)

async function assertRuntimeContracts({
  groupings,
  syntax,
}: {
  groupings: CodeSplitGroupings
  syntax?: 'named-default'
}) {
  // A temporary app whose real runtime imports resolve as from this directory
  const root = await createAppDirectory(__dirname, '.runtime-contract-')
  try {
    await mkdir(path.join(root, 'routes'))
    let source = await readFile(fixture, 'utf8')
    if (syntax === 'named-default') {
      source = source
        .replace(
          'function createSeed()',
          'export default function createSeed()',
        )
        .replace('export default createSeed', '')
    }
    await writeFile(path.join(root, 'routes/shared-runtime.tsx'), source)
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/shared-runtime'
export { Route, firstState, secondState, 'odd-name' } from './routes/shared-runtime'
export function render() {
  return renderToString(createElement(Route.options.component))
}`,
    )

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: groupings,
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        sourcemap: true,
        rollupOptions: {
          output: {
            entryFileNames: 'entry.mjs',
            chunkFileNames: '[name].mjs',
          },
        },
      },
    })

    const throwLine =
      source.split('\n').findIndex((line) => line.includes('throw new Error')) +
      1
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    // When each initialiser runs (with the route module, or with the first
    // module that needs it) is free (SPEC G3); that every initialiser runs
    // exactly once, and that the state the entry re-exports is ready when
    // the entry has loaded, is not.
    // In a child process that never outlives the test worker
    const { stdout } = await runNodeProgram(
      `import assert from 'node:assert/strict'
const messages = []
console.log = (message) => messages.push(message)
const { Route, render, firstState, secondState, 'odd-name': oddState } = await import(${JSON.stringify(entryUrl)})
assert.deepEqual(messages, [...new Set(messages)])
assert.ok(messages.includes('shared-runtime:reference'))
const state = Route.options.beforeLoad({})
assert.strictEqual(firstState, state)
assert.strictEqual(secondState, state)
assert.strictEqual(oddState, state)
assert.equal(state.count, 0)
assert.strictEqual(await Route.options.loader({}), state)
assert.equal(state.count, 1)
await Route.options.component.preload()
assert.equal(render(), 'count:1')
assert.strictEqual(await Route.options.loader({}), state)
assert.equal(render(), 'count:2')
await Route.options.component.preload()
assert.deepEqual([...messages].sort(), ['shared-runtime:component', 'shared-runtime:reference', 'shared-runtime:seed', 'shared-runtime:state'])
await Route.options.loader({})
assert.throws(render, (error) => {
  assert.equal(error.message, 'route source-map contract')
  assert.match(error.stack, /shared-runtime\\.tsx(?:\\?[^\\n:]+)?:${throwLine}:/)
  return true
})
process.stdout.write('route contracts passed')`,
      { nodeArgs: ['--enable-source-maps'] },
    )
    expect(stdout).toBe('route contracts passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
