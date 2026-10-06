import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build, transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'
import type { UnpluginOptions } from 'unplugin'

const runNode = promisify(execFile)
const filename = 'route.tsx'

/** Compiles the reference module and every default split chunk of a route. */
function compileRouteModules(code: string) {
  const groupings = defaultCodeSplitGroupings
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
  const chunks: Record<string, string> = {}
  for (const targets of groupings) {
    const split = targets.join('-')
    chunks[split] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  return { reference: reference?.code ?? code, chunks }
}

/** Erases TypeScript and compiles JSX with React's classic runtime. */
async function compileClassicJsx(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic' },
  })
  return result.code
}

const reactNamespaceImport = /import \* as React from ['"]react['"]/

/**
 * Builds `route` as a code-split route with the real Vite plugin, imports it in
 * a separate Node process, renders its component once, then evaluates
 * `readAfterRender` (which may use the route module's exports as `route`).
 */
async function renderSplitRoute(options: {
  route: string
  readAfterRender: string
  classicJsx?: boolean
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.real-world-runtime-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(path.join(root, 'routes/page.tsx'), options.route)
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import * as route from './routes/page'
export async function render() {
  const component: any = route.Route.options.component
  await component.preload?.()
  const html = renderToString(createElement(component))
  return { html, after: ${options.readAfterRender} }
}`,
    )
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      ...(options.classicJsx ? { oxc: { jsx: { runtime: 'classic' } } } : {}),
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: [['component']],
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
    return JSON.parse(stdout) as { html: string; after: unknown }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

// Route files commonly export a store, context or query helper next to the
// route and read it from the route component as well.
const exportedStoreRoute = `
import { createFileRoute } from '@tanstack/react-router'
const initialCount = 0
export const store = { count: initialCount }
function Page() {
  store.count++
  return <p>{store.count - initialCount}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`

describe('split chunks share exported route-file bindings', () => {
  it('imports an exported binding that depends on state the component also reads', async () => {
    const { reference, chunks } = compileRouteModules(exportedStoreRoute)
    const chunk = chunks.component!
    // The chunk must use the route module's instance instead of creating its own.
    expect(chunk).not.toMatch(declarationOf('store'))
    expect(chunk).toMatch(/import \{[^}]*\bstore\b[^}]*\} from/)
    expect(reference).toMatch(/export const store\b/)
    expect(await getModuleErrors(chunk)).toEqual([])
  })

  it('imports an exported React context whose default value the component reads', () => {
    const { chunks } = compileRouteModules(`
import { createContext, useContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const defaultTheme = 'light'
export const ThemeContext = createContext(defaultTheme)
function Page() {
  const theme = useContext(ThemeContext)
  return <p>{theme === defaultTheme ? 'default' : theme}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    // A second createContext() call would make providers rendered by other
    // modules (which import ThemeContext from the route file) invisible here.
    expect(chunks.component).not.toMatch(declarationOf('ThemeContext'))
    expect(chunks.component).toMatch(
      /import \{[^}]*\bThemeContext\b[^}]*\} from/,
    )
  })

  it('mutates the exported binding other modules see when the component renders', async () => {
    const result = await renderSplitRoute({
      route: exportedStoreRoute,
      readAfterRender: 'route.store.count',
    })
    expect(result).toEqual({ html: '<p>1</p>', after: 1 })
  }, 30_000)
})

/** Drives the code-splitter transforms the way a bundler does for one file. */
async function splitThroughPlugin(file: string, code: string) {
  const context = createRouterPluginContext()
  context.routesByFile.set(file, { routeId: '/route' })
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true },
    context,
  ) as Array<UnpluginOptions>
  const byName = (suffix: string) =>
    plugins.find((plugin) => plugin.name.endsWith(suffix))!
  const reference = byName('compile-reference-file')
  const hook = reference.vite!.configResolved!
  const config = { root: process.cwd(), command: 'build', plugins: [] }
  await (typeof hook === 'function'
    ? hook.call({} as never, config as never)
    : hook.handler.call({} as never, config as never))
  const run = (plugin: UnpluginOptions, id: string) => {
    const transform = plugin.transform
    if (!transform || typeof transform === 'function') {
      throw new Error('Expected object transform')
    }
    const result = transform.handler.call({} as never, code, id) as
      | { code: string }
      | string
      | null
    return result === null || typeof result === 'string' ? result : result.code
  }
  const referenceCode = run(reference, file)!
  const modules: Record<string, string> = { reference: referenceCode }
  const pending = [...referenceCode.matchAll(/\?(tsr-[^"'`]+)["'`]/g)]
  const seen = new Set<string>()
  while (pending.length) {
    const query = pending.shift()![1]!
    if (seen.has(query)) {
      continue
    }
    seen.add(query)
    const plugin = byName(
      query.startsWith('tsr-shared')
        ? 'compile-shared-file'
        : 'compile-virtual-file',
    )
    modules[query] = run(plugin, `${file}?${query}`)!
    pending.push(...modules[query].matchAll(/\?(tsr-[^"'`]+)["'`]/g))
  }
  return modules
}

// File names taken from real apps: optional locale segments, pathless groups,
// escaped dots, flat dotted routes and directory `route.tsx` files.
describe('code-splitter plugin with real-world route file names', () => {
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/_layout/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
    'src/routes/_app.$organizationId.$projectId.events._tabs.index.tsx',
    'src/pages/project/$projectId/route.tsx',
    'src/routes/docs/$.tsx',
  ])('splits %s into valid modules that import each other', async (name) => {
    const file = path.join(process.cwd(), name).replaceAll('\\', '/')
    const modules = await splitThroughPlugin(
      file,
      `
import { createFileRoute } from '@tanstack/react-router'
const formatter = new Intl.DateTimeFormat('en')
export const Route = createFileRoute('/route')({
  loader: () => formatter.format(0),
  component: () => <p>{formatter.format(Route.useLoaderData().length)}</p>,
  errorComponent: ({ error }) => <p>{error.message}</p>,
})
`,
    )
    expect(Object.keys(modules).sort()).toEqual([
      'reference',
      'tsr-shared=1',
      'tsr-split=component',
      'tsr-split=errorComponent',
    ])
    for (const [query, code] of Object.entries(modules)) {
      expect(await getModuleErrors(code), query).toEqual([])
    }
    // Chunks import the route module and the shared module by the file's id.
    expect(modules['tsr-split=component']).toContain(`${file}?tsr-shared=1`)
    expect(modules['tsr-split=component']).toMatch(
      new RegExp(`from ['"]${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
    )
  })
})

// TypeScript lets a type and a value share a name; exporting both is valid.
describe('route files exporting a type and a value with the same name', () => {
  it.each([
    {
      name: 'a type alias and an export specifier',
      exports: `export type Post = { id: string }
function Post(id: string): Post {
  return { id }
}
export { Post }`,
    },
    {
      name: 'an interface and an export specifier',
      exports: `export interface Post { id: string }
const Post = (id: string): Post => ({ id })
export { Post }`,
    },
    {
      name: 'a type re-export and a value re-export',
      exports: `export type { Post } from './post-types'
export { Post } from './post-values'`,
    },
  ])('compiles $name', async ({ exports }) => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
${exports}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
    const { reference, chunks } = compileRouteModules(code)
    expect(reference).toMatch(/export \{ Post \}/)
    expect(await getModuleErrors(reference)).toEqual([])
    expect(chunks.component).toContain('posts')
    expect(await transformWithHmrPlugin(code)).toContain('import.meta.hot')
  })
})

// TypeScript erases type positions, so a declaration whose binding only appears
// in a type is still live JavaScript that runs when the route module loads.
const typeOnlyReferencedRoute = `
import { createFileRoute } from '@tanstack/react-router'
import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('/posts')
declare module './analytics' {
  interface Registry {
    posts: typeof analytics
  }
}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
const analyticsSideEffect = /registerAnalytics\(\s*['"]\/posts['"]\s*\)/

describe('declarations only referenced from types', () => {
  it('stay in the reference module', async () => {
    const { reference } = compileRouteModules(typeOnlyReferencedRoute)
    expect(reference).toMatch(analyticsSideEffect)
    expect(reference).toMatch(declarationOf('analytics'))
    expect(await getModuleErrors(reference)).toEqual([])
  })

  it('stay in a route module compiled for HMR', async () => {
    const output = await transformWithHmrPlugin(typeOnlyReferencedRoute)
    expect(output).toMatch(analyticsSideEffect)
    expect(output).toMatch(declarationOf('analytics'))
  })
})

async function transformWithHmrPlugin(code: string) {
  const file = path.join(process.cwd(), 'src/routes/posts.tsx')
  const context = createRouterPluginContext()
  context.routesByFile.set(file, { routeId: '/posts' })
  const plugin = createRouterHmrPlugin(
    { target: 'react' },
    context,
  ) as UnpluginOptions
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  const result = (await transform.handler.call({} as never, code, file)) as
    | { code: string }
    | string
  return typeof result === 'string' ? result : result.code
}

// With React's classic JSX runtime (`jsx: "react"` in tsconfig, or
// `jsxRuntime: 'classic'`), JSX compiles to `React.createElement`, so the
// React import that TypeScript code otherwise uses only for types must stay.
const classicRoute = `
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
function Page({ title = 'classic' }: { title?: React.ReactNode }) {
  return <p>{title}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`

describe('classic JSX runtime', () => {
  it('keeps the React import a split component needs for classic JSX', async () => {
    const { chunks } = compileRouteModules(classicRoute)
    const javascript = await compileClassicJsx(chunks.component!)
    expect(javascript).toContain('React.createElement')
    expect(javascript).toMatch(reactNamespaceImport)
  })

  it('keeps the React import of a route module compiled for HMR', async () => {
    const code = await transformWithHmrPlugin(`
import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
export const Route = createFileRoute('/posts')({
  component: () => <Layout><Outlet /></Layout>,
})
`)
    const javascript = await compileClassicJsx(code)
    expect(javascript).toContain('React.createElement')
    expect(javascript).toMatch(reactNamespaceImport)
  })

  it('renders a split component built with the classic JSX runtime', async () => {
    const result = await renderSplitRoute({
      route: classicRoute,
      readAfterRender: 'null',
      classicJsx: true,
    })
    expect(result.html).toBe('<p>classic</p>')
  }, 30_000)
})

// The code splitter runs before the bundler's JSX transform, so a split chunk
// must keep the route file's JSX pragma: it selects the JSX runtime
// (`@emotion/react`, `theme-ui`, Preact, ...) of the components it now holds.
describe('file-level JSX pragmas', () => {
  it('stay at the top of a split component chunk', async () => {
    const { chunks } =
      compileRouteModules(`/** @jsxImportSource @emotion/react */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/styled')({
  component: StyledPage,
})

function StyledPage() {
  return <main css={{ color: 'hotpink' }}>styled</main>
}
`)
    const { code } = await transformWithOxc(chunks.component!, 'chunk.tsx', {
      jsx: { runtime: 'automatic', importSource: 'react' },
    })
    expect(code).toMatch(/from ["']@emotion\/react\/jsx-runtime["']/)
  })
})
