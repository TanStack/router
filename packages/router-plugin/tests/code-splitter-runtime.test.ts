import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'
import type { CodeSplitGroupings } from '../src/core/constants'

const runNode = promisify(execFile)
const fixture = path.resolve(
  __dirname,
  'code-splitter/test-files/react/shared-runtime.tsx',
)

it.each([
  { name: 'eager loader', groupings: [['component']] },
  { name: 'separate lazy loader', groupings: [['component'], ['loader']] },
  { name: 'combined lazy loader', groupings: [['component', 'loader']] },
])(
  'preserves executable route contracts with $name',
  async ({ groupings }) => {
    // Keep the temporary app inside the package so real runtime imports resolve.
    const root = await mkdtemp(path.join(__dirname, '.runtime-contract-'))
    try {
      await mkdir(path.join(root, 'routes'))
      await copyFile(fixture, path.join(root, 'routes/shared-runtime.tsx'))
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
              defaultBehavior: groupings as CodeSplitGroupings,
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

      const source = await readFile(fixture, 'utf8')
      const throwLine =
        source
          .split('\n')
          .findIndex((line) => line.includes('throw new Error')) + 1
      const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
      const combined = groupings.some(
        (group) => group.includes('component') && group.includes('loader'),
      )
      const { stdout } = await runNode(process.execPath, [
        '--enable-source-maps',
        '--input-type=module',
        '--eval',
        `import assert from 'node:assert/strict'
const messages = []
console.log = (message) => messages.push(message)
const { Route, render, firstState, secondState, 'odd-name': oddState } = await import(${JSON.stringify(entryUrl)})
assert.deepEqual(messages, ['shared-runtime:seed', 'shared-runtime:state', 'shared-runtime:reference'])
const state = Route.options.beforeLoad({})
assert.strictEqual(firstState, state)
assert.strictEqual(secondState, state)
assert.strictEqual(oddState, state)
assert.equal(state.count, 0)
assert.strictEqual(await Route.options.loader({}), state)
assert.equal(state.count, 1)
assert.deepEqual(messages, ${JSON.stringify(combined ? ['shared-runtime:seed', 'shared-runtime:state', 'shared-runtime:reference', 'shared-runtime:component'] : ['shared-runtime:seed', 'shared-runtime:state', 'shared-runtime:reference'])})
await Route.options.component.preload()
assert.equal(render(), 'count:1')
assert.strictEqual(await Route.options.loader({}), state)
assert.equal(render(), 'count:2')
await Route.options.component.preload()
assert.deepEqual(messages, ['shared-runtime:seed', 'shared-runtime:state', 'shared-runtime:reference', 'shared-runtime:component'])
await Route.options.loader({})
assert.throws(render, (error) => {
  assert.equal(error.message, 'route source-map contract')
  assert.match(error.stack, /shared-runtime\\.tsx(?:\\?[^\\n:]+)?:${throwLine}:/)
  return true
})
process.stdout.write('route contracts passed')`,
      ])
      expect(stdout).toBe('route contracts passed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)
