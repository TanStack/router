/**
 * Scenarios ported from Turbopack's tree-shaker analyzer fixtures
 * (vercel/next.js `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`,
 * MIT) that main's code splitter gets wrong and the Yuku compiler gets right.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'

const runNode = promisify(execFile)

/**
 * Builds `route` as a code-split route with the real Vite plugin, then renders
 * its component in a separate Node process.
 */
async function renderSplitComponent(route: string) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-turbopack-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(path.join(root, 'routes/index.tsx'), route)
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/index'
export async function render() {
  const component: any = Route.options.component
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
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
      `const { render } = await import(${JSON.stringify(entryUrl)})
process.stdout.write(JSON.stringify(await render()))`,
    ])
    return JSON.parse(stdout) as string
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('ported Turbopack tree-shaker fixtures: fixed by the Yuku compiler', () => {
  // Source: analyzer/assign-before-decl-var and analyzer/assign-before-decl-fn.
  // Main gives the split chunk the hoisted declaration but not the assignment
  // written above it, so the component reads the unassigned value.
  it.each([
    {
      name: 'a var',
      setup: `value = 'assigned'
var value: string`,
      render: '{value}',
      html: '<p>assigned</p>',
    },
    {
      name: 'a function declaration',
      setup: `value = () => 'reassigned'
function value() {
  return 'declared'
}`,
      render: '{value()}',
      html: '<p>reassigned</p>',
    },
  ])(
    'renders $name assigned before its hoisted declaration',
    async ({ setup, render, html }) => {
      expect(
        await renderSplitComponent(`import { createFileRoute } from '@tanstack/react-router'
${setup}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`),
      ).toBe(html)
    },
    30_000,
  )
})
