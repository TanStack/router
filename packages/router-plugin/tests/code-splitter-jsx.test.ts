import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'
import {
  compileRouteModules,
  expectValidModules,
  head,
} from './regression-helpers'

it.each(['Widget', '_Widget', '$Widget', 'ÉWidget', 'éWidget'])(
  'preserves the shared JSX component %s across separate loader and component chunks',
  async (name) => {
    // Keep the temporary app inside the package so runtime imports resolve.
    const root = await mkdtemp(path.join(__dirname, '.jsx-reference-'))
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    try {
      await mkdir(path.join(root, 'routes'))
      await writeFile(
        path.join(root, 'routes/__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      )
      await writeFile(
        path.join(root, 'routes/widget.tsx'),
        `import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
const ${name} = () => 'hello'
export const Route = createFileRoute('/widget')({
  loader: () => ${name},
  component: () => <${name} />,
})`,
      )
      server = await createServer({
        root,
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
      // The physical module establishes shared ownership before chunks load.
      await server.ssrLoadModule('/routes/widget.tsx')
      const componentModule = await server.ssrLoadModule(
        '/routes/widget.tsx?tsr-split=component',
      )
      const loaderModule = await server.ssrLoadModule(
        '/routes/widget.tsx?tsr-split=loader',
      )
      const element = componentModule.component()
      expect(typeof element.type).toBe('function')
      expect(element.type()).toBe('hello')
      expect(loaderModule.loader()()).toBe('hello')
      expect(element.type).toBe(loaderModule.loader())
    } finally {
      await server?.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

// Regression in the Yuku migration, found by differential fuzzing: JSX text
// right after a closing fragment that starts with non-ASCII punctuation (an
// em dash, a middle dot) fails to parse with "Invalid character at start of
// identifier". Yuku parser bug,
// https://github.com/yuku-toolchain/yuku/issues/260; passes once Yuku ships
// the fix.
it('splits a component whose JSX text after a fragment starts with an em dash', async () => {
  const { modules } =
    compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <p><>first</> — second</p>,
})
`)
  expect(modules['virtual component']).toContain('— second')
  await expectValidModules(modules)
})
