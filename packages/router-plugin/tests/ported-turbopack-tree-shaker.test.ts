/**
 * Known code-splitter bugs found with scenarios ported from Turbopack's
 * tree-shaker analyzer fixtures
 * (vercel/next.js `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`,
 * MIT), pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, test } from 'vitest'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'

const runNode = promisify(execFile)

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-turbopack-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
    )
    for (const [file, code] of Object.entries(options.files)) {
      await writeFile(path.join(root, file), code)
    }
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
            defaultBehavior: defaultCodeSplitGroupings,
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${options.script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('known code-splitter bugs ported from Turbopack tree-shaker fixtures', () => {
  // Source: analyzer/write-order, analyzer/shared-2 and
  // analyzer/shared-regression.
  // Bug: when a declaration moves into the shared module (the loader and the
  // split component both read it), top-level statements that write the
  // bindings it reads stay in the reference module. The shared module is
  // imported, so it evaluates first: the declaration's initializer runs before
  // statements that preceded it in the source. Impact: initialization order
  // changes, e.g. a store created from a registry no longer sees the plugins
  // registered above it. Remove `.fails` once fixed.
  test.fails(
    'a shared declaration still runs after the top-level writes that precede it',
    async () => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
const plugins: Array<string> = []
plugins.push('auth')
const store = { plugins: [...plugins] }
plugins.push('late')
export const Route = createFileRoute('/')({
  loader: () => store.plugins,
  component: () => <p>{store.plugins.join()}</p>,
})`,
        },
        script: `const loaded = await entry.Route.options.loader({})
return [loaded, await entry.render(entry.Route.options.component)]`,
      })
      expect(result).toEqual([['auth'], '<p>auth</p>'])
    },
    30_000,
  )
})
