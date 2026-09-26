import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Public Vite/router-plugin reproduction. No internal AST or cache mutation.
// Default asserts correct behavior; --expect-regression asserts the known bug.
const args = process.argv.slice(2)
const workspaceIndex = args.indexOf('--workspace')
const workspace = path.resolve(
  workspaceIndex === -1
    ? fileURLToPath(new URL('../../../', import.meta.url))
    : args[workspaceIndex + 1],
)
const expectRegression = args.includes('--expect-regression')
const { createServer } = await import(
  pathToFileURL(path.join(workspace, 'node_modules/vite/dist/node/index.js'))
)
const { tanstackRouter } = await import(
  pathToFileURL(path.join(workspace, 'packages/router-plugin/dist/esm/vite.js'))
)
const directory = await mkdtemp(
  path.join(workspace, 'packages/router-plugin/.jsx-reference-repro-'),
)
let server
const cases = [
  ['control', 'Widget'],
  ['underscore', '_Widget'],
  ['dollar', '$Widget'],
]
const results = []
try {
  await mkdir(path.join(directory, 'routes'))
  await writeFile(
    path.join(directory, 'routes/__root.tsx'),
    `import { createRootRoute } from '@tanstack/react-router';
export const Route = createRootRoute({});`,
  )
  for (const [filename, name] of cases) {
    await writeFile(
      path.join(directory, `routes/${filename}.tsx`),
      `import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
const ${name} = () => 'hello';
export const Route = createFileRoute('/${filename}')({
  loader: () => ${name},
  component: () => <${name} />,
});`,
    )
  }
  server = await createServer({
    root: directory,
    configFile: false,
    logLevel: 'silent',
    server: { watch: null },
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        autoCodeSplitting: true,
        codeSplittingOptions: {
          addHmr: false,
          defaultBehavior: [['loader'], ['component']],
        },
      }),
    ],
  })
  for (const [filename, name] of cases) {
    // The physical module plans shared ownership before split modules load.
    await server.ssrLoadModule(`/routes/${filename}.tsx`)
    const componentModule = await server.ssrLoadModule(
      `/routes/${filename}.tsx?tsr-split=component`,
    )
    const loaderModule = await server.ssrLoadModule(
      `/routes/${filename}.tsx?tsr-split=loader`,
    )
    if (expectRegression && filename !== 'control') {
      assert.throws(() => componentModule.component(), {
        name: 'ReferenceError',
        message: `${name} is not defined`,
      })
      results.push({ name, result: 'confirmed missing JSX binding' })
    } else {
      const element = componentModule.component()
      assert.equal(typeof element.type, 'function')
      assert.equal(element.type(), 'hello')
      assert.equal(loaderModule.loader()(), 'hello')
      results.push({
        name,
        result: 'component and loader execute successfully',
      })
    }
  }
  console.log(JSON.stringify({ workspace, expectRegression, results }, null, 2))
} finally {
  await server?.close()
  await rm(directory, { recursive: true, force: true })
}
