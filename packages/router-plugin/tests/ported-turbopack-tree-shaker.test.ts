/**
 * Scenarios ported from Turbopack's tree-shaker analyzer fixtures
 * (vercel/next.js `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`,
 * MIT). Turbopack splits a module into one part per export and computes which
 * statements each part needs; here each split route option plays an export,
 * and the tests check that its chunk gets every statement and import it needs.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'

const filename = 'route.tsx'
const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const runNode = promisify(execFile)

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings: [...sharedBindings].sort() }
}

async function getErrorsByModule(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  return errors
}

function noErrors(modules: Record<string, string>) {
  return Object.fromEntries(Object.keys(modules).map((name) => [name, []]))
}

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

describe('ported Turbopack tree-shaker fixtures: imports each part needs', () => {
  // Source: analyzer/import-with-clause
  it('keeps import attributes on the imports each module receives', async () => {
    const { modules } =
      compileRouteModules(`${head}import data from './data.json' with { type: 'json' }
import meta from './meta.json' with { type: 'json' }
export const Route = createFileRoute('/')({
  loader: () => meta,
  component: () => <p>{data.title}</p>,
})
`)
    expect(modules.reference).toMatch(
      /import meta from ['"]\.\/meta\.json['"] with \{ type: ['"]json['"] \}/,
    )
    expect(modules.reference).not.toContain('data.json')
    expect(modules['virtual component']).toMatch(
      /import data from ['"]\.\/data\.json['"] with \{ type: ['"]json['"] \}/,
    )
    expect(modules['virtual component']).not.toContain('meta.json')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: analyzer/typeof-1
  it('treats a typeof operand as a reference to the import', async () => {
    const { modules } =
      compileRouteModules(`${head}import { ClientThing } from './client-thing'
import { ServerThing } from './server-thing'
export const Route = createFileRoute('/')({
  loader: () => typeof ServerThing,
  component: () => <p>{typeof ClientThing}</p>,
})
`)
    expect(modules.reference).toContain('./server-thing')
    expect(modules.reference).not.toContain('./client-thing')
    expect(modules['virtual component']).toContain('./client-thing')
    expect(modules['virtual component']).not.toContain('./server-thing')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('ported Turbopack tree-shaker fixtures: statements each part needs', () => {
  // Source: analyzer/route-kind (the compiled form of a TypeScript enum)
  it('gives the split component the statement that initializes the var it reads', async () => {
    const { modules } = compileRouteModules(`${head}var Kind: any
;(function (Kind: any) {
  Kind['A'] = 'a'
})(Kind || (Kind = {}))
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{Kind.A}</p>,
})
`)
    const component = modules['virtual component']!
    expect(component).toMatch(declarationOf('Kind'))
    expect(component).toContain(`Kind['A'] = 'a'`)
    expect(component).toContain('(Kind || (Kind = {}))')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: analyzer/nanoid, analyzer/let-bug-1 and analyzer/logger
  it('shares mutable state that the loader and the component update through shared helpers', async () => {
    const route = `${head}let pool: Array<number> | undefined, poolOffset = 0
let fillPool = (bytes: number) => {
  if (!pool || pool.length < bytes) {
    pool = new Array(bytes * 4).fill(0).map((_, i) => i)
    poolOffset = 0
  }
  poolOffset += bytes
}
let random = (bytes: number) => {
  fillPool(bytes)
  return pool!.slice(poolOffset - bytes, poolOffset)
}
let nanoid = (size = 2) => {
  fillPool(size)
  return pool!.slice(poolOffset - size, poolOffset).join('')
}
export const Route = createFileRoute('/')({
  loader: () => random(2),
  component: () => <p>{nanoid()}</p>,
})
`
    const { modules, sharedBindings } = compileRouteModules(route)
    expect(sharedBindings).toEqual(['fillPool', 'pool', 'poolOffset'])
    expect(modules.reference).toMatch(declarationOf('random'))
    expect(modules.reference).not.toMatch(declarationOf('nanoid'))
    expect(modules['virtual component']).toMatch(declarationOf('nanoid'))
    expect(modules['virtual component']).not.toMatch(declarationOf('random'))
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    // Both parts must observe one pool: the component continues where the
    // loader stopped.
    const result = await buildAndRun({
      files: { 'routes/index.tsx': route },
      script: `const loaded = await entry.Route.options.loader({})
return [loaded, await entry.render(entry.Route.options.component)]`,
    })
    expect(result).toEqual([[0, 1], '<p>23</p>'])
  }, 30_000)
})
