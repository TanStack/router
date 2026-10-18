import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import { createApp, generate, read } from './app'
import { routesOf } from './route-tree'
import type { Config } from '../src'

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
 * runtime, so only the structure of the rendered output is meaningful); like
 * a bundler of an app without other packages, any other import fails.
 * Returns the route (its id and the constructor that created it) and the
 * text and elements it renders.
 */
async function evaluateScaffold(code: string, target: Config['target']) {
  const element = `const element = (type, children) => ({ type, children: [children ?? []].flat(Infinity).filter((c) => c != null && c !== false) })`
  const stubs: Record<string, string> = {
    [`@tanstack/${target}-router`]: `export const createFileRoute = (id) => (options) => ({ id, options, createdWith: 'createFileRoute' })
export const createLazyFileRoute = (id) => (options) => ({ id, options, createdWith: 'createLazyFileRoute' })
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
  return {
    id: Route.id,
    createdWith: Route.createdWith,
    text: text.join(''),
    types,
  }
}

// A new, empty route, lazy route or root route file is scaffolded into a
// working route for each target: the file evaluates to a Route created with
// the right constructor and id, whose component renders something (the root
// route's renders an Outlet). What it renders is free.
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
      expect(rootFile.types).toContain('Outlet')
      for (const [file, id, createdWith] of [
        ['posts.tsx', '/posts', 'createFileRoute'],
        ['about.lazy.tsx', '/about', 'createLazyFileRoute'],
        ['{-$locale}/contact.tsx', '/{-$locale}/contact', 'createFileRoute'],
        ['{-$locale}/help.lazy.tsx', '/{-$locale}/help', 'createLazyFileRoute'],
      ]) {
        const route = await scaffolded(file!)
        expect([route.id, route.createdWith]).toEqual([id, createdWith])
        expect(route.text.length + route.types.length).toBeGreaterThan(0)
      }
      // (this package has no Solid router: Solid route trees do not load)
      if (target !== 'solid') {
        expect(await routesOf(generatedRouteTree)).toEqual({
          __root__: 'routes/__root.tsx',
          '/posts': 'routes/posts.tsx',
          '/about': null,
          '/{-$locale}/contact': 'routes/{-$locale}/contact.tsx',
          '/{-$locale}/help': null,
        })
      }
    })

    // The docs (file-based-routing.md, `quoteStyle` and `semicolons`): "when
    // you first create a new route, those files will be formatted with the
    // quote style you specify" / "with semicolons".
    it.each([
      { quoteStyle: 'single', semicolons: false },
      { quoteStyle: 'double', semicolons: true },
    ] as const)(
      'scaffolded files follow quoteStyle $quoteStyle and semicolons $semicolons',
      async ({ quoteStyle, semicolons }) => {
        const files = ['__root.tsx', 'posts.tsx', 'about.lazy.tsx']
        const root = await createApp(
          Object.fromEntries(files.map((file) => [`src/routes/${file}`, ''])),
        )
        await generate(root, { target, quoteStyle, semicolons })

        for (const file of files) {
          const code = await read(root, `src/routes/${file}`)
          const style = codeStyle(code)
          expect(style.quotes).toEqual([quoteStyle === 'single' ? "'" : '"'])
          expect(style.statements).toBeGreaterThan(0)
          expect(style.withSemicolon).toBe(semicolons ? style.statements : 0)
        }
      },
    )
  },
)

/**
 * The quote characters of the string literals of `code` without quote
 * characters in them (a formatter may quote the others either way to avoid
 * escapes; JSX attribute values aside), and how many of its statements that end with a semicolon in
 * a file using them (imports, expressions, returns, variable declarations
 * outside loop heads) there are, and end with one.
 */
function codeStyle(code: string) {
  const { program, errors } = parseSync('route.tsx', code)
  expect(errors).toEqual([])
  const quotes = new Set<string>()
  let statements = 0
  let withSemicolon = 0
  const visit = (node: unknown, parent?: Record<string, any>): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, parent))
      return
    }
    if (!node || typeof node !== 'object') {
      return
    }
    const record = node as Record<string, any>
    if (record.type === 'JSXAttribute') {
      return
    }
    if (
      record.type === 'Literal' &&
      typeof record.value === 'string' &&
      !/["']/.test(record.value)
    ) {
      quotes.add(String(record.raw)[0]!)
    }
    if (
      [
        'ImportDeclaration',
        'ExpressionStatement',
        'ReturnStatement',
        'VariableDeclaration',
      ].includes(record.type) &&
      !(parent?.type ?? '').startsWith('For') &&
      parent?.type !== 'ExportNamedDeclaration'
    ) {
      statements++
      if (code.slice(record.start, record.end).endsWith(';')) {
        withSemicolon++
      }
    }
    for (const value of Object.values(record)) {
      visit(value, record)
    }
  }
  visit(program)
  return { quotes: [...quotes], statements, withSemicolon }
}
