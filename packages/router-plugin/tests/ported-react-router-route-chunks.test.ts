/**
 * Known code-splitter bugs found by porting React Router's route-chunk and
 * export-removal tests (remix-run/react-router
 * `packages/react-router-dev/vite/route-chunks-test.ts` and
 * `remove-exports-test.ts`, MIT), pinned as expected failures.
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
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'
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
  const root = await mkdtemp(path.join(__dirname, '.ported-react-router-'))
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

describe('known code-splitter bugs ported from React Router', () => {
  // Source: route-chunks-test.ts "top level await", "object property
  // mutation" and "class method mutation".
  // Bug: a top-level statement that initializes or mutates a binding only the
  // split component reads stays in the reference module, which therefore
  // keeps its own copy of the binding, while the component chunk gets the
  // declaration and the statement again. Impact: the setup code (`register`,
  // `new Greeter()`) runs once in the reference module and once more when the
  // chunk loads, duplicating registrations and module state.
  // Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a registration call',
      setup: `import { register } from '../registry'
const items: Array<string> = []
register(items)`,
      render: `{items.join()}`,
      html: '<p>item</p>',
    },
    {
      name: 'a method reassignment',
      setup: `import { count } from '../registry'
class Greeter {
  constructor() {
    count()
  }
  greet() {
    return 'hello'
  }
}
const greeter: any = new Greeter()
greeter.greet = () => 'mutated'`,
      render: `{greeter.greet()}`,
      html: '<p>mutated</p>',
    },
  ])(
    '$name for a component-only binding runs once',
    async ({ setup, render, html }) => {
      const result = await buildAndRun({
        groupings: defaultCodeSplitGroupings,
        files: {
          'registry.ts': `export function count() {
  ;(globalThis as any).setupCalls = ((globalThis as any).setupCalls ?? 0) + 1
}
export function register(items: Array<string>) {
  count()
  items.push('item')
}`,
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${setup}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`,
          'entry.ts': renderEntry,
        },
        script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.setupCalls]`,
      })
      expect(result).toEqual([html, 1])
    },
    30_000,
  )

  // Source: remove-exports-test.ts "function statement with property
  // assignment" and "arrow function with property assignment".
  // Bug: statements that assign properties to a split component
  // (`Page.displayName = ...`) stay in the reference module. Main keeps the
  // statements but removes the component's declaration, so the reference
  // module throws `ReferenceError: Page is not defined`; the Yuku PR keeps a
  // second copy of the component in the reference module. Impact: the route
  // crashes (main) or the component is not split out of the main bundle (PR).
  // Remove `.fails` once fixed.
  test.fails(
    'property assignments move into the chunk with the split component',
    async () => {
      const code = `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return <div>{Page.label}</div>
}
Page.label = 'page'
Page.displayName = 'PageDisplay'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`
      const reference = compileCodeSplitReferenceRoute({
        code,
        filename: 'route.tsx',
        id: 'route.tsx',
        addHmr: false,
        codeSplitGroupings: defaultCodeSplitGroupings,
        targetFramework: 'react',
      })!.code
      const component = compileCodeSplitVirtualRoute({
        code,
        filename: 'route.tsx?tsr-split=component',
        splitTargets: ['component'],
      }).code
      expect(reference).not.toMatch(/\bPage\b/)
      expect(component).toMatch(declarationOf('Page'))
      expect(component).toMatch(/Page\.displayName = ['"]PageDisplay['"]/)
      expect(await getModuleErrors(reference)).toEqual([])
      expect(await getModuleErrors(component)).toEqual([])
    },
  )
})
