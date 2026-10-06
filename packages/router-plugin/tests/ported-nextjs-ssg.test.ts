/**
 * Known code-splitter bugs found by porting Next.js's SSG transform fixtures
 * (vercel/next.js `crates/next-custom-transforms/tests/fixture/ssg`, MIT),
 * pinned as expected failures.
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
import type { CodeSplitGroupings } from '../src/core/constants'

const runNode = promisify(execFile)

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  groupings: CodeSplitGroupings
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-nextjs-ssg-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
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
            defaultBehavior: options.groupings,
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

const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

describe('known code-splitter bugs ported from Next.js SSG fixtures', () => {
  // Source: ssg/getStaticProps/destructuring-assignment-array and
  // ssg/getStaticProps/destructuring-assignment-object.
  // Bug: when a destructuring declares one binding that nothing references
  // and one that only the split component reads, the whole declaration stays
  // in the reference module (the unreferenced binding is kept) and is copied
  // into the component chunk as well. Impact: the initializer (`init()`)
  // runs twice, so module state (stores, subscriptions, caches) is duplicated
  // and the component reads a different instance than the reference module.
  // Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'an array destructuring',
      declaration: 'const [unused, value] = init()',
      init: `['unused', 'value']`,
      render: '{value}',
      html: '<p>value</p>',
    },
    {
      name: 'an object rest destructuring',
      declaration: 'const { unused, ...rest } = init()',
      init: `{ unused: 'unused', value: 'value' }`,
      render: `{Object.keys(rest).join()}`,
      html: '<p>value</p>',
    },
  ])(
    '$name with an unreferenced sibling binding runs its initializer once',
    async ({ declaration, init, render, html }) => {
      const result = await buildAndRun({
        groupings: defaultCodeSplitGroupings,
        files: {
          'init.ts': `export function init(): any {
  ;(globalThis as any).initCalls = ((globalThis as any).initCalls ?? 0) + 1
  return ${init}
}`,
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { init } from '../init'
${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`,
          'entry.ts': renderEntry,
        },
        script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.initCalls]`,
      })
      expect(result).toEqual([html, 1])
    },
    30_000,
  )
})
