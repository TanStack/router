import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'
import {
  compileCodeSplitReferenceRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { declarationOf, getModuleErrors } from './validate-module'

const runNode = promisify(execFile)
const filename = 'route.tsx'

function compileReference(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: sharedBindings.size > 0 ? sharedBindings : undefined,
  })
  return { sharedBindings, reference: reference?.code ?? code }
}

describe('split options that read the Route singleton', () => {
  // `Route` itself stays in the reference module, so reading it from a split
  // option must not attribute every dependency of the route options to that
  // option's chunk.
  it.each([
    {
      name: 'an inline arrow component',
      component: `() => {
    const posts = Route.useLoaderData()
    return <ul>{posts.length}</ul>
  }`,
    },
    {
      name: 'an inline named function component',
      component: `function Posts() {
    const { page } = Route.useSearch()
    return <p>{page}</p>
  }`,
    },
  ])(
    'keeps loader-only helpers in the reference module for $name',
    async ({ component }) => {
      const { sharedBindings, reference } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
const formatter = new Intl.NumberFormat('en')
async function fetchPosts() {
  return [formatter.format(1)]
}
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: ${component},
})
`)

      expect([...sharedBindings]).toEqual([])
      expect(reference).not.toContain('tsr-shared')
      expect(reference).toMatch(declarationOf('fetchPosts'))
      expect(reference).toMatch(declarationOf('formatter'))
      expect(await getModuleErrors(reference)).toEqual([])
    },
  )

  it('does not turn a reassigned loader-only binding into an import', () => {
    const { sharedBindings, reference } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`)

    expect([...sharedBindings]).toEqual([])
    // An imported binding is read-only: `label = ...` would throw at runtime
    expect(reference).not.toMatch(/import\s*\{[^}]*\blabel\b/)
    expect(reference).toMatch(declarationOf('label'))
  })

  it('still runs a route whose loader reads a reassigned binding', async () => {
    // Keep the temporary app inside the package so real runtime imports resolve.
    const root = await mkdtemp(path.join(__dirname, '.route-reference-'))
    try {
      await mkdir(path.join(root, 'routes'))
      await writeFile(
        path.join(root, 'routes/label.tsx'),
        `import { createFileRoute } from '@tanstack/react-router'
let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => Route.useLoaderData(),
})
`,
      )
      await writeFile(
        path.join(root, 'routes/__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      )
      await writeFile(
        path.join(root, 'entry.ts'),
        `export { Route } from './routes/label'`,
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
            codeSplittingOptions: { addHmr: false },
          }),
        ],
        build: {
          ssr: path.join(root, 'entry.ts'),
          outDir: 'dist',
          minify: false,
          rollupOptions: {
            output: {
              entryFileNames: 'entry.mjs',
              chunkFileNames: '[name].mjs',
            },
          },
        },
      })

      const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
      const { stdout } = await runNode(process.execPath, [
        '--input-type=module',
        '--eval',
        `const { Route } = await import(${JSON.stringify(entryUrl)})
process.stdout.write(String(await Route.options.loader({})))`,
      ])
      expect(stdout).toBe('updated')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('keeps sharing a binding that the component and the loader both read', () => {
    const { sharedBindings } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
const formatName = (name: string) => name.toUpperCase()
export const Route = createFileRoute('/user')({
  loader: () => formatName('a'),
  component: () => <h1>{formatName(Route.useLoaderData())}</h1>,
})
`)

    expect([...sharedBindings]).toEqual(['formatName'])
  })
})
