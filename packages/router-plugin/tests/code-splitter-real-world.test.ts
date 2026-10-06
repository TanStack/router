import path from 'node:path'
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  createCodeSplitterTransforms,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

/** Erases TypeScript and compiles JSX with React's classic runtime. */
async function compileClassicJsx(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic' },
  })
  return result.code
}

const reactNamespaceImport = /import \* as React from ['"]react['"]/

/** Runs the route HMR plugin on `src/routes/posts.tsx` for a React route. */
function transformWithHmrPlugin(code: string) {
  return transformWithRouteHmrPlugin(
    code,
    { target: 'react' },
    { file: routeFile('posts'), routeId: '/posts' },
  )
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
    const { modules } = compileRouteModules(exportedStoreRoute)
    const chunk = modules['virtual component']!
    // The chunk must use the route module's instance instead of creating its own.
    expect(chunk).not.toMatch(declarationOf('store'))
    expect(chunk).toMatch(/import \{[^}]*\bstore\b[^}]*\} from/)
    expect(modules.reference).toMatch(/export const store\b/)
    expect(await getModuleErrors(chunk)).toEqual([])
  })

  it('imports an exported React context whose default value the component reads', () => {
    const { modules } = compileRouteModules(`
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
    expect(modules['virtual component']).not.toMatch(
      declarationOf('ThemeContext'),
    )
    expect(modules['virtual component']).toMatch(
      /import \{[^}]*\bThemeContext\b[^}]*\} from/,
    )
  })

  it('mutates the exported binding other modules see when the component renders', async () => {
    const result = await buildAndRun({
      files: { 'routes/index.tsx': exportedStoreRoute },
      defaultBehavior: [['component']],
      script: `const html = await entry.render(entry.Route.options.component)
return { html, after: entry.store.count }`,
    })
    expect(result).toEqual({ html: '<p>1</p>', after: 1 })
  }, 30_000)
})

/** Drives the code-splitter transforms the way a bundler does for one file. */
async function splitThroughPlugin(file: string, code: string) {
  const splitter = await createCodeSplitterTransforms({}, { [file]: '/route' })
  const referenceCode = splitter.reference(code, file)!
  const modules: Record<string, string> = { reference: referenceCode }
  const pending = [...referenceCode.matchAll(/\?(tsr-[^"'`]+)["'`]/g)]
  const seen = new Set<string>()
  while (pending.length) {
    const query = pending.shift()![1]!
    if (seen.has(query)) {
      continue
    }
    seen.add(query)
    const transform = query.startsWith('tsr-shared')
      ? splitter.shared
      : splitter.virtual
    modules[query] = transform(code, `${file}?${query}`)!
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
    const { modules } = compileRouteModules(code)
    expect(modules.reference).toMatch(/export \{ Post \}/)
    expect(await getModuleErrors(modules.reference!)).toEqual([])
    expect(modules['virtual component']).toContain('posts')
    expect(transformWithHmrPlugin(code)).toContain('import.meta.hot')
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
    const { reference } = compileRouteModules(typeOnlyReferencedRoute).modules
    expect(reference).toMatch(analyticsSideEffect)
    expect(reference).toMatch(declarationOf('analytics'))
    expect(await getModuleErrors(reference!)).toEqual([])
  })

  it('stay in a route module compiled for HMR', () => {
    const output = transformWithHmrPlugin(typeOnlyReferencedRoute)
    expect(output).toMatch(analyticsSideEffect)
    expect(output).toMatch(declarationOf('analytics'))
  })
})

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
    const { modules } = compileRouteModules(classicRoute)
    const javascript = await compileClassicJsx(modules['virtual component']!)
    expect(javascript).toContain('React.createElement')
    expect(javascript).toMatch(reactNamespaceImport)
  })

  it('keeps the React import of a route module compiled for HMR', async () => {
    const code = transformWithHmrPlugin(`
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
    const html = await buildAndRun({
      files: { 'routes/index.tsx': classicRoute },
      classicJsx: true,
      defaultBehavior: [['component']],
      script: 'return entry.render(entry.Route.options.component)',
    })
    expect(html).toBe('<p>classic</p>')
  }, 30_000)
})

// The code splitter runs before the bundler's JSX transform, so a split chunk
// must keep the route file's JSX pragma: it selects the JSX runtime
// (`@emotion/react`, `theme-ui`, Preact, ...) of the components it now holds.
describe('file-level JSX pragmas', () => {
  it('stay at the top of a split component chunk', async () => {
    const { modules } =
      compileRouteModules(`/** @jsxImportSource @emotion/react */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/styled')({
  component: StyledPage,
})

function StyledPage() {
  return <main css={{ color: 'hotpink' }}>styled</main>
}
`)
    const { code } = await transformWithOxc(
      modules['virtual component']!,
      'chunk.tsx',
      { jsx: { runtime: 'automatic', importSource: 'react' } },
    )
    expect(code).toMatch(/from ["']@emotion\/react\/jsx-runtime["']/)
  })
})
