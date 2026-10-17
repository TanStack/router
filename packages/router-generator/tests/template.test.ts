import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { Generator, getConfig } from '../src'
import { createApp, generate, read } from './app'
import { routesOf } from './route-tree'
import type { Config } from '../src'

/** The string the route call of a route file creates its route with. */
function routeIdInFile(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  const ids: Array<unknown> = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') {
      return
    }
    const record = node as Record<string, any>
    if (
      record.type === 'CallExpression' &&
      record.callee?.type === 'Identifier' &&
      /^create(?:Lazy)?FileRoute$/.test(record.callee.name)
    ) {
      ids.push(record.arguments[0]?.value)
    }
    Object.values(record).forEach(visit)
  }
  visit(program)
  expect(ids).toHaveLength(1)
  return ids[0]
}

/**
 * Runs the generator for `target` on an app whose route files with quotes
 * in their paths are empty, and returns the route ids the files it writes
 * create their routes with.
 */
async function scaffoldQuotedRoutes(target: Config['target']) {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-template-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute()`,
    )
    const files = ['say-"hi".tsx', 'later-"x".lazy.tsx']
    for (const file of files) {
      await writeFile(path.join(root, 'routes', file), '')
    }
    const config = getConfig({
      target,
      disableLogging: true,
      routesDirectory: path.join(root, 'routes'),
      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
      // Same filesystem as the app, so the generator can rename its temp files
      tmpDir: path.join(root, '.tanstack/tmp'),
    })
    await new Generator({ config, root }).run()
    const ids: Array<unknown> = []
    for (const file of files) {
      ids.push(
        routeIdInFile(await readFile(path.join(root, 'routes', file), 'utf8')),
      )
    }
    return ids
  } finally {
    log.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
}

// A new, empty route file gets a route scaffolded from the target's
// template, with the route path as written in a string literal, quotes
// included.
describe('route templates', () => {
  it.each(['react', 'solid'] as const)(
    'scaffold %s routes whose paths contain quotes',
    async (target) => {
      expect(await scaffoldQuotedRoutes(target)).toEqual([
        '/say-"hi"',
        '/later-"x"',
      ])
    },
  )

  // Bug: the Vue route templates put the route path into the component's
  // string literal unescaped (`h("div", {}, "Hello \"%%tsrPath%%\"!")`),
  // where the React and Solid ones put it into JSX text, so a path with a
  // `"` ends the string. Source: round-2 rewrite of the template tests,
  // which only checked the escaped route id.
  // Impact: route generation fails for a new, empty Vue route file whose
  // path contains a double quote.
  it.fails('scaffold vue routes whose paths contain quotes', async () => {
    expect(await scaffoldQuotedRoutes('vue')).toEqual([
      '/say-"hi"',
      '/later-"x"',
    ])
  })
})

/** A rendered element: its type and children (strings or elements). */
interface Rendered {
  type: unknown
  children: Array<Rendered | string>
}

/**
 * Evaluates a scaffolded route file for `target` and renders its route
 * component once. The file may import only the target's router package
 * (stubbed: route constructors, `Outlet`) and the target's framework
 * (stubbed: Vue's `h`; Solid's JSX compiles like React's, to a stub JSX
 * runtime); like a bundler of an app without other packages, any other import
 * fails. Returns the route and the text and elements it renders.
 */
async function evaluateScaffold(code: string, target: Config['target']) {
  const element = `const element = (type, children) => ({ type, children: [children ?? []].flat(Infinity).filter((c) => c != null && c !== false) })`
  const stubs: Record<string, string> = {
    [`@tanstack/${target}-router`]: `export const createFileRoute = (id) => (options) => ({ id, options })
export const createLazyFileRoute = createFileRoute
export const createRootRoute = (options) => ({ id: '__root__', options })
export const Outlet = 'Outlet'`,
    ...(target === 'vue'
      ? {
          vue: `${element}\nexport const h = (type, props, children) => element(type, children)`,
        }
      : {
          [target === 'solid' ? 'solid-js' : 'react']: `export {}`,
          'react/jsx-runtime': `${element}
export const jsx = (type, props) => element(type, props.children)
export const jsxs = jsx
export const Fragment = 'Fragment'`,
        }),
  }
  const { code: javascript } = await transformWithOxc(code, 'route.tsx')
  const { module, errors } = parseSync('route.js', javascript)
  expect(errors).toEqual([])
  let linked = javascript
  for (const statement of [...module.staticImports].sort(
    (a, b) => b.moduleRequest.start - a.moduleRequest.start,
  )) {
    const specifier = statement.moduleRequest.value
    const stub = stubs[specifier]
    if (stub === undefined) {
      throw new Error(`The scaffolded file imports "${specifier}"`)
    }
    linked =
      linked.slice(0, statement.moduleRequest.start) +
      JSON.stringify(`data:text/javascript,${encodeURIComponent(stub)}`) +
      linked.slice(statement.moduleRequest.end)
  }
  const { Route } = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(linked)}`
  )
  const rendered: Rendered = Route.options.component()
  const text: Array<string> = []
  const types: Array<unknown> = []
  const visit = (node: Rendered | string) => {
    if (typeof node === 'string') {
      text.push(node)
    } else {
      types.push(node.type)
      node.children.forEach(visit)
    }
  }
  visit(rendered)
  return { id: Route.id, text: text.join(''), types }
}

// A new, empty route, lazy route or root route file is scaffolded into a
// working route for each target.
describe.each(['react', 'solid', 'vue'] as const)(
  'scaffolded %s routes',
  (target) => {
    it('empty root, route and lazy route files become routes whose components render', async () => {
      const root = await createApp({
        'src/routes/__root.tsx': '',
        'src/routes/posts.tsx': '',
        'src/routes/about.lazy.tsx': '',
        'src/routes/{-$locale}/contact.tsx': '',
        'src/routes/{-$locale}/help.lazy.tsx': '',
      })
      const { generatedRouteTree } = await generate(root, { target })

      const scaffolded = async (file: string) =>
        evaluateScaffold(await read(root, `src/routes/${file}`), target)
      const rootFile = await scaffolded('__root.tsx')
      expect(rootFile.id).toBe('__root__')
      expect(rootFile.text).toContain('Hello')
      expect(rootFile.types).toContain('Outlet')
      expect(await scaffolded('posts.tsx')).toMatchObject({
        id: '/posts',
        text: 'Hello "/posts"!',
      })
      expect(await scaffolded('about.lazy.tsx')).toMatchObject({
        id: '/about',
        text: 'Hello "/about"!',
      })
      // The greeting names the route path, its param included.
      expect(await scaffolded('{-$locale}/contact.tsx')).toMatchObject({
        id: '/{-$locale}/contact',
        text: expect.stringMatching(/\$locale\/contact/),
      })
      expect(await scaffolded('{-$locale}/help.lazy.tsx')).toMatchObject({
        id: '/{-$locale}/help',
        text: expect.stringMatching(/\$locale\/help/),
      })
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/posts': 'routes/posts.tsx',
        '/about': null,
        '/{-$locale}/contact': 'routes/{-$locale}/contact.tsx',
        '/{-$locale}/help': null,
      })
    })
  },
)
