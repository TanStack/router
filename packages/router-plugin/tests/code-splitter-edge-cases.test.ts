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
import type { CodeSplitGroupings } from '../src/core/constants'

const filename = 'route.tsx'
const runNode = promisify(execFile)

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(
  code: string,
  groupings: CodeSplitGroupings = defaultCodeSplitGroupings,
) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: groupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
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
  return { modules, sharedBindings }
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
 * Builds `source` as a code-split route with the real Vite plugin, then renders
 * its component twice in a separate Node process and returns both renders.
 */
async function renderSplitRouteTwice(
  source: string,
  groupings: CodeSplitGroupings,
) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.edge-case-runtime-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(path.join(root, 'routes/edge.tsx'), source)
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/edge'
export async function renderTwice() {
  const component: any = Route.options.component
  await component.preload?.()
  return [renderToString(createElement(component)), renderToString(createElement(component))]
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
          codeSplittingOptions: { addHmr: false, defaultBehavior: groupings },
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
      `const { renderTwice } = await import(${JSON.stringify(entryUrl)})
process.stdout.write(JSON.stringify(await renderTwice()))`,
    ])
    return JSON.parse(stdout) as Array<string>
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('code-splitter keeps one module state', () => {
  it.each([
    {
      name: 'an exported function mutating private state',
      source: `import { createFileRoute } from '@tanstack/react-router'
const state = { count: 0 }
export function increment() {
  return ++state.count
}
function Page() {
  increment()
  return <p>{state.count}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    {
      name: 'an exported getter reading a private let',
      source: `import { createFileRoute } from '@tanstack/react-router'
let renders = 0
export function getRenders() {
  return renders
}
function Page() {
  renders++
  return <p>{getRenders()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
  ])(
    'renders a split component that uses $name',
    async ({ source }) => {
      // Without splitting, the component renders 1 and then 2: the exported
      // function and the component must observe the same module-level binding.
      expect(await renderSplitRouteTwice(source, [['component']])).toEqual([
        '<p>1</p>',
        '<p>2</p>',
      ])
    },
    30_000,
  )
})

describe('code-splitter handles var declarations nested in top-level statements', () => {
  it.each([
    {
      name: 'a for loop head',
      setup: 'for (var value = 0; value < 3; value++) {}',
    },
    { name: 'a for-in head', setup: 'for (var value in { a: 1 }) {}' },
    { name: 'a for-of head', setup: "for (var value of ['a']) {}" },
    {
      name: 'an if block',
      setup: "if (typeof window === 'undefined') { var value = 'server' }",
    },
    {
      name: 'a try block',
      setup: "try { var value = JSON.parse('1') } catch {}",
    },
    { name: 'a labeled block', setup: 'init: { var value = 1; break init }' },
    { name: 'a switch case', setup: 'switch (1) { case 1: var value = 1 }' },
  ])(
    'emits valid modules when $name declares a binding used by the loader and the component',
    async ({ setup }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
${setup}
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <div>{value}</div>,
})
`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    },
  )

  it('emits valid modules when a block-scoped var is exported and used by the component', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
if (typeof window === 'undefined') { var flag = 'server' }
export { flag }
export const Route = createFileRoute('/')({
  component: () => <div>{flag}</div>,
})
`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('keeps a for-var declaration in the chunk of the only component using it', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
for (var index = 0; index < 3; index++) {}
for (var key in { a: 1 }) {}
export const Route = createFileRoute('/')({
  component: () => <div>{index}{key}</div>,
})
`)
    expect(modules['virtual component']).toMatch(/for \(var index = 0/)
    expect(modules['virtual component']).toMatch(/for \(var key in/)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('code-splitter handles large expressions', () => {
  it('compiles a route with a long method chain', async () => {
    // Builder APIs (schemas, query builders) produce deep left-nested calls
    const chain = Array.from({ length: 200 }, (_, i) => `.add(${i})`).join('')
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import { builder } from './builder'
const schema = builder()${chain}
export const Route = createFileRoute('/')({
  loader: () => schema,
  component: () => <div>{String(schema)}</div>,
})
`)
    expect(Object.values(modules).join('\n')).toContain('.add(199)')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('code-splitter follows object literal semantics', () => {
  it('splits route options that repeat a split key like the runtime object does', async () => {
    // Duplicate keys are legal JavaScript: the last property wins at runtime.
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <div>first</div>,
  component: () => <div>last</div>,
})
`)
    expect(modules['virtual component']).toContain('last')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('code-splitter coverage for syntax inside route files', () => {
  it('splits route options declared in a variable', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './api'
function Posts() {
  return <ul>{Route.useLoaderData().length}</ul>
}
const options = {
  loader: () => fetchPosts(),
  component: Posts,
}
export const Route = createFileRoute('/posts')(options)
`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    expect(modules.reference).toContain('fetchPosts()')
    expect(modules['virtual component']).toMatch(declarationOf('Posts'))
    // The split component reads the Route singleton from the reference module
    expect(modules['virtual component']).toMatch(
      /import \{ Route \} from ['"]route\.tsx['"]/,
    )
    expect(modules['virtual component']).not.toContain('fetchPosts')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('never extracts a destructuring whose sibling depends on Route', async () => {
    const { modules, sharedBindings } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
const getRoute = () => Route
const [cache, routeGetter] = [new Map(), getRoute]
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}{typeof routeGetter}</div>,
})
`)
    expect([...sharedBindings]).toEqual([])
    expect(modules.reference).toMatch(declarationOf('Route'))
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('keeps module-level re-exports and empty exports valid in every module', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
export * from './lib'
export * as lib from './lib'
export {}
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}</div>,
})
`)
    expect(modules.reference).toMatch(/export \* from ['"]\.\/lib['"]/)
    expect(modules.reference).toMatch(/export \* as lib from ['"]\.\/lib['"]/)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('erases type-only imports and exports from split chunks', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import type { User } from './types'
import { type Settings, defaults } from './settings'
export type * from './types'
export type { User }
const current: User | Settings = defaults
export const Route = createFileRoute('/')({
  loader: () => current,
  component: () => <div>{String(current)}</div>,
})
`)
    for (const [name, code] of Object.entries(modules)) {
      if (name === 'reference') {
        continue
      }
      expect(code).not.toContain('./types')
    }
    expect(modules.shared).toMatch(
      /import \{ defaults \} from ['"]\.\/settings['"]/,
    )
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('re-exports a shared binding under string-literal and default names', async () => {
    const { modules, sharedBindings } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
const store = { count: 0 }
export { store as "my-store", store as default }
export const Route = createFileRoute('/')({
  loader: () => ++store.count,
  component: () => <div>{store.count}</div>,
})
`)
    expect([...sharedBindings]).toEqual(['store'])
    expect(modules.reference).toMatch(/["']my-store["']/)
    expect(modules.reference).toMatch(/\bdefault\b/)
    expect(modules['virtual component']).not.toMatch(declarationOf('store'))
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('shares a class with private members and a static block', async () => {
    const { modules, sharedBindings } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
class Counter {
  static registry: Array<string> = []
  static { Counter.registry.push('init') }
  #count = 0
  #bump() { return ++this.#count }
  increment() { return this.#bump() }
  get count() { return this.#count }
  static owns(value: object) { return #count in value }
}
const counter = new Counter()
export const Route = createFileRoute('/')({
  loader: () => counter.increment(),
  component: () => <div>{counter.count}</div>,
})
`)
    expect([...sharedBindings].sort()).toEqual(['Counter', 'counter'])
    expect(modules.shared).toContain('static {')
    expect(modules['virtual component']).not.toMatch(declarationOf('Counter'))
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  it('keeps namespace imports used as JSX member tags in the split chunk', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import * as UI from './ui'
import { "kebab-name" as Kebab } from './icons'
export const Route = createFileRoute('/')({
  loader: () => typeof UI.Box,
  component: () => <UI.Box><UI.Text>hi</UI.Text><Kebab /></UI.Box>,
})
`)
    expect(modules['virtual component']).toMatch(
      /import \* as UI from ['"]\.\/ui['"]/,
    )
    expect(modules['virtual component']).toMatch(
      /import \{ ["']kebab-name["'] as Kebab \} from ['"]\.\/icons['"]/,
    )
    expect(modules.reference).not.toContain('./icons')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})
