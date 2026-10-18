/**
 * Full generator runs on apps in temporary directories: route files the
 * generator fixes or scaffolds, and configuration options, read through
 * `getConfig` (and `tsr.config.json`) like the bundler plugins and the CLI do.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSync } from 'vite'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Generator, getConfig } from '../src'
import { evaluateRouteFile, routeIdOf } from './route-id'
import { routesOf } from './route-tree'
import type { Config } from '../src'

let roots: Array<string> = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  )
  roots = []
})

/**
 * Creates an app in a temporary directory with the given files (paths
 * relative to the app root) and returns its root.
 */
async function createApp(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-generator-options-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  return root
}

/**
 * The configuration of the app at `root`, read like the bundler plugins do
 * (its `tsr.config.json`, then `inlineConfig`), with the default `src/routes`
 * directory and `src/routeTree.gen.ts` route tree. Temporary files go to the
 * app, on the same filesystem.
 */
function configOf(root: string, inlineConfig: Partial<Config> = {}) {
  return getConfig(
    {
      disableLogging: true,
      tmpDir: path.join(root, '.tanstack/tmp'),
      ...inlineConfig,
    },
    root,
  )
}

/** Runs the generator once on the app at `root`. */
async function generate(root: string, inlineConfig: Partial<Config> = {}) {
  const config = configOf(root, inlineConfig)
  await new Generator({ config, root }).run()
  return config
}

function read(root: string, file: string) {
  return readFile(path.join(root, file), 'utf8')
}

function rootRoute(target: Config['target'] = 'react') {
  return `import { createRootRoute } from '@tanstack/${target}-router'

export const Route = createRootRoute()
`
}

describe('route files whose id the generator fixes', () => {
  const postsRoute = (
    target: Config['target'] = 'react',
  ) => `import { createFileRoute } from '@tanstack/${target}-router'

export const Route = createFileRoute('/old')({
  component: Posts,
})

function Posts() {
  return <h1>Posts</h1>
}
`

  test.each([
    {
      name: 'CRLF line endings',
      file: 'posts.tsx',
      source: postsRoute().replaceAll('\n', '\r\n'),
    },
    {
      name: 'a UTF-8 BOM',
      file: 'posts.tsx',
      source: `\uFEFF${postsRoute()}`,
    },
    {
      name: 'a UTF-8 BOM and CRLF line endings',
      file: 'posts.tsx',
      source: `\uFEFF${postsRoute()}`.replaceAll('\n', '\r\n'),
    },
    {
      name: 'quoteStyle double and semicolons, in a file using them',
      file: 'posts.tsx',
      config: { quoteStyle: 'double', semicolons: true },
      source: `import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/old")({
  component: Posts,
});

function Posts() {
  return <h1 className="title">Posts</h1>;
}
`,
    },
    {
      name: 'quoteStyle double and semicolons, in a file not using them',
      file: 'posts.tsx',
      config: { quoteStyle: 'double', semicolons: true },
      source: postsRoute(),
    },
    {
      name: 'the solid target',
      file: 'posts.tsx',
      config: { target: 'solid' },
      source: postsRoute('solid'),
    },
    {
      name: 'the vue target',
      file: 'posts.tsx',
      config: { target: 'vue' },
      source: postsRoute('vue'),
    },
    {
      name: 'a .jsx file',
      file: 'posts.jsx',
      source: postsRoute(),
    },
    {
      name: 'a .js file',
      file: 'posts.js',
      source: `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({
  loader: () => fetch('/api/posts'),
})
`,
    },
  ] satisfies Array<{
    name: string
    file: string
    source: string
    config?: Partial<Config>
  }>)(
    'only the route id changes in a route file with $name',
    async ({ file, source, config }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(config?.target),
        [`src/routes/${file}`]: source,
      })
      const { generatedRouteTree } = await generate(root, config)

      const written = await read(root, `src/routes/${file}`)
      expect(written).toBe(source.replace(/(['"])\/old\1/, '$1/posts$1'))
      expect(await routeIdOf(written)).toBe('/posts')
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/posts': `routes/${file}`,
      })
    },
  )

  describe.each(['react', 'solid', 'vue'] as const)('target %s', (target) => {
    const routerPackage = `@tanstack/${target}-router`

    test.each([
      { name: 'LF', newline: '\n', bom: '' },
      { name: 'CRLF and a BOM', newline: '\r\n', bom: '\uFEFF' },
    ])(
      'a lazy route file created with createFileRoute gets createLazyFileRoute, with $name',
      async ({ newline, bom }) => {
        const source =
          `${bom}import { Link, createFileRoute } from '${routerPackage}'

export const Route = createFileRoute('/posts')({
  component: () => <Link to="/">Home</Link>,
})
`.replaceAll('\n', newline)
        const root = await createApp({
          'src/routes/__root.tsx': rootRoute(target),
          'src/routes/posts.tsx': `import { createFileRoute } from '${routerPackage}'

export const Route = createFileRoute('/posts')({
  loader: () => fetch('/api/posts'),
})
`,
          'src/routes/posts.lazy.tsx': source,
        })
        const { generatedRouteTree } = await generate(root, { target })

        const written = await read(root, 'src/routes/posts.lazy.tsx')
        // Only the constructor changes: the file keeps its BOM, and the code
        // outside the imports changes only in the constructor call.
        expect(written.startsWith('\uFEFF')).toBe(bom !== '')
        expect(withoutImports(written)).toBe(
          withoutImports(source).replace(
            'createFileRoute(',
            'createLazyFileRoute(',
          ),
        )
        expect(valueImports(written, routerPackage).sort()).toEqual([
          'Link',
          'createLazyFileRoute',
        ])
        const { Route } = await evaluateRouteFile(written, ['Link'])
        expect([Route.id, Route.createdWith]).toEqual([
          '/posts',
          'createLazyFileRoute',
        ])
        expect(await routesOf(generatedRouteTree)).toEqual({
          __root__: 'routes/__root.tsx',
          '/posts': 'routes/posts.tsx',
        })
      },
    )

    test(`a route file without the route constructor import gets it from ${routerPackage}`, async () => {
      const source = `import { Link } from '${routerPackage}'

export const Route = createFileRoute('/old')({
  component: Link,
})
`
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(target),
        'src/routes/posts.tsx': source,
      })
      await generate(root, { target })

      const written = await read(root, 'src/routes/posts.tsx')
      expect(valueImports(written, routerPackage)).toContain('createFileRoute')
      const { Route } = await evaluateRouteFile(written, ['Link'])
      expect([Route.id, Route.options.component]).toEqual(['/posts', 'Link'])
      expect(withoutImports(written)).toBe(
        withoutImports(source.replace('/old', '/posts')),
      )
    })
  })
})

describe('empty route files', () => {
  // Control for the pin below: an empty .tsx route file.
  test('an empty .tsx route file is scaffolded, and the other routes still generate', async () => {
    const { written, routes } = await scaffold('posts.tsx')
    expect(parseErrors(written, 'posts.tsx')).toEqual([])
    expect(await routeIdOf(written)).toBe('/posts')
    expect(routes).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
      '/posts': 'routes/posts.tsx',
    })
  })

  // Bug: an empty .ts route file is scaffolded with the route template, which
  // renders JSX; the generator then parses the scaffolded file as plain
  // TypeScript (no JSX) and the run fails with "Error transforming route
  // file". Issue #8480.
  // Source: src/generator.ts:1073 (the route template for any script file),
  // src/generator.ts:1096 (parse of the scaffolded file).
  // Impact: an empty .ts route file breaks route generation for the whole
  // app (no route tree update) until the file is renamed or filled in.
  test.fails(
    'an empty .ts route file is scaffolded, and the other routes still generate',
    async () => {
      const { written, routes } = await scaffold('posts.ts')
      expect(parseErrors(written, 'posts.ts')).toEqual([])
      expect(await routeIdOf(written)).toBe('/posts')
      expect(routes).toEqual({
        __root__: 'routes/__root.tsx',
        '/': 'routes/index.tsx',
        '/posts': 'routes/posts.ts',
      })
    },
  )

  /**
   * Runs the generator on an app with an index route and an empty
   * `routes/<file>`; returns the scaffolded file and the route tree's routes.
   */
  async function scaffold(file: string) {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
`,
      [`src/routes/${file}`]: '',
    })
    const { generatedRouteTree } = await generate(root)
    return {
      written: await read(root, `src/routes/${file}`),
      routes: await routesOf(generatedRouteTree),
    }
  }

  /** The syntax errors of `code` as a file named `fileName`. */
  function parseErrors(code: string, fileName: string) {
    return parseSync(fileName, code).errors.map((error) => error.message)
  }
})

describe('route files with unusual names and contents', () => {
  test('route files with non-ASCII names get routes with their paths', async () => {
    const route = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({})
`
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/café.tsx': route,
      'src/routes/日本語.tsx': route,
      'src/routes/日本語.$id.tsx': route,
    })
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/café': 'routes/café.tsx',
      '/日本語': 'routes/日本語.tsx',
      '/日本語/$id': 'routes/日本語.$id.tsx',
    })
    expect(await read(root, 'src/routes/café.tsx')).toBe(
      route.replace('/old', '/café'),
    )
    expect(await read(root, 'src/routes/日本語.$id.tsx')).toBe(
      route.replace('/old', '/日本語/$id'),
    )
  })

  // Control: "a route file without the route constructor import gets it from
  // @tanstack/react-router" above (same harness, without the prefix).

  // Bug: the generator adds a missing route constructor import at the very
  // start of the file, before a UTF-8 BOM.
  // Source: src/transform/transform.ts:560 (`s.prepend` of the import).
  // Impact: the BOM ends up after the import, as a stray zero-width
  // character on the second line, and the file no longer starts with it.
  test.fails.each([{ name: 'a UTF-8 BOM', prefix: '\uFEFF' }])(
    'a route file starting with $name keeps it when the route constructor import is added',
    async ({ prefix }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/posts.tsx': `${prefix}export const Route = createFileRoute('/old')({})\n`,
      })
      await generate(root)

      const written = await read(root, 'src/routes/posts.tsx')
      expect(written.startsWith(prefix)).toBe(true)
      expect(await routeIdOf(written)).toBe('/posts')
    },
  )
})

describe('virtual route config in tsr.config.json', () => {
  test('a virtual route config object in tsr.config.json generates its routes, and fixes their ids', async () => {
    const route = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({})
`
    const root = await createApp({
      'tsr.config.json': JSON.stringify({
        virtualRouteConfig: {
          type: 'root',
          file: 'root.tsx',
          children: [
            { type: 'index', file: 'home.tsx' },
            {
              type: 'route',
              path: '/posts',
              file: 'posts/layout.tsx',
              children: [
                { type: 'index', file: 'posts/list.tsx' },
                { type: 'route', path: '$postId', file: 'posts/detail.tsx' },
              ],
            },
            {
              type: 'layout',
              id: 'auth',
              file: 'auth-layout.tsx',
              children: [{ type: 'route', path: '/login', file: 'login.tsx' }],
            },
            { type: 'physical', directory: 'legacy', pathPrefix: '/legacy' },
          ],
        },
      }),
      'src/routes/root.tsx': rootRoute(),
      'src/routes/home.tsx': route,
      'src/routes/posts/layout.tsx': route,
      'src/routes/posts/list.tsx': route,
      'src/routes/posts/detail.tsx': route,
      'src/routes/auth-layout.tsx': route,
      'src/routes/login.tsx': route,
      'src/routes/legacy/about.tsx': route,
    })
    const { generatedRouteTree } = await generate(root)

    const routes = await routesOf(generatedRouteTree)
    expect(routes).toEqual({
      __root__: 'routes/root.tsx',
      '/': 'routes/home.tsx',
      '/posts': 'routes/posts/layout.tsx',
      '/posts/': 'routes/posts/list.tsx',
      '/posts/$postId': 'routes/posts/detail.tsx',
      '/_auth': 'routes/auth-layout.tsx',
      '/_auth/login': 'routes/login.tsx',
      '/legacy/about': 'routes/legacy/about.tsx',
    })
    for (const [id, file] of Object.entries(routes)) {
      if (id !== '__root__') {
        expect(await routeIdOf(await read(root, `src/${file}`))).toBe(id)
      }
    }
  })
})

describe('route tree options', () => {
  /** An app with a root, index, posts and lazy posts route. */
  const app = (ext = 'tsx') => ({
    [`src/routes/__root.${ext}`]: rootRoute(),
    [`src/routes/index.${ext}`]: `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
`,
    [`src/routes/posts.${ext}`]: `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
    [`src/routes/posts.lazy.${ext}`]: `import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({})
`,
  })

  const appRoutes = (ext = 'tsx') => ({
    __root__: `routes/__root.${ext}`,
    '/': `routes/index.${ext}`,
    '/posts': `routes/posts.${ext}`,
  })

  /**
   * The route file imports of a route tree: static and dynamic imports of
   * relative or absolute paths.
   */
  async function routeFileImports(treeFile: string) {
    const code = await readFile(treeFile, 'utf8')
    const { module } = parseSync(path.basename(treeFile), code)
    return [
      ...module.staticImports.map((statement) => statement.moduleRequest.value),
      ...module.dynamicImports.map((statement) =>
        code
          .slice(statement.moduleRequest.start, statement.moduleRequest.end)
          .slice(1, -1),
      ),
    ].filter((specifier) => !specifier.startsWith('@'))
  }

  test.each([
    { config: {}, quote: "'", semicolons: false },
    { config: { quoteStyle: 'double' }, quote: '"', semicolons: false },
    { config: { semicolons: true }, quote: "'", semicolons: true },
    {
      config: { quoteStyle: 'double', semicolons: true },
      quote: '"',
      semicolons: true,
    },
  ] satisfies Array<{
    config: Partial<Config>
    quote: string
    semicolons: boolean
  }>)(
    'the route tree follows the quoteStyle and semicolons options: $config',
    async ({ config, quote, semicolons }) => {
      const root = await createApp(app())
      const { generatedRouteTree } = await generate(root, config)

      const code = await readFile(generatedRouteTree, 'utf8')
      const { program, errors } = parseSync('routeTree.gen.ts', code)
      expect(errors).toEqual([])
      const quotes = new Set<string>()
      const visit = (node: unknown) => {
        if (Array.isArray(node)) {
          node.forEach(visit)
        } else if (node && typeof node === 'object') {
          const { type, value, raw } = node as Record<string, unknown>
          if (type === 'Literal' && typeof value === 'string') {
            quotes.add(String(raw)[0]!)
          }
          Object.values(node).forEach(visit)
        }
      }
      visit(program)
      expect([...quotes]).toEqual([quote])
      const statements = program.body.filter(
        (statement) =>
          statement.type === 'ImportDeclaration' ||
          statement.type === 'VariableDeclaration' ||
          (statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'VariableDeclaration'),
      )
      expect(statements.length).toBeGreaterThan(0)
      for (const statement of statements) {
        expect(code.slice(statement.start, statement.end).endsWith(';')).toBe(
          semicolons,
        )
      }
      expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
    },
  )

  test('addExtensions true imports the route files by their file names', async () => {
    const root = await createApp(app())
    const { generatedRouteTree } = await generate(root, {
      addExtensions: true,
    })

    const imports = await routeFileImports(generatedRouteTree)
    expect(imports.length).toBe(4)
    for (const specifier of imports) {
      expect(specifier).toMatch(/\.tsx$/)
      expect(
        existsSync(path.resolve(path.dirname(generatedRouteTree), specifier)),
      ).toBe(true)
    }
    expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
  })

  test.each(['js', '.js'])(
    'addExtensions "%s" in tsr.config.json imports the route files with a .js extension',
    async (addExtensions) => {
      const root = await createApp({
        ...app(),
        'tsr.config.json': JSON.stringify({ addExtensions }),
      })
      const { generatedRouteTree } = await generate(root)

      const imports = await routeFileImports(generatedRouteTree)
      expect(imports.length).toBe(4)
      for (const specifier of imports) {
        expect(specifier).toMatch(/[^.]\.js$/)
      }
      expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
    },
  )

  test('disableTypes in tsr.config.json generates a JavaScript route tree', async () => {
    const root = await createApp({
      ...app('jsx'),
      'tsr.config.json': JSON.stringify({
        disableTypes: true,
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    })
    const { generatedRouteTree } = await generate(root)

    expect(generatedRouteTree).toBe(path.join(root, 'src/routeTree.gen.js'))
    expect(existsSync(path.join(root, 'src/routeTree.gen.ts'))).toBe(false)
    const code = await readFile(generatedRouteTree, 'utf8')
    expect(parseSync('routeTree.gen.js', code, { lang: 'js' }).errors).toEqual(
      [],
    )
    expect(await routesOf(generatedRouteTree)).toEqual(appRoutes('jsx'))
  })

  test('importRoutesUsingAbsolutePaths imports the route files by absolute paths', async () => {
    const root = await createApp(app())
    const { generatedRouteTree } = await generate(root, {
      importRoutesUsingAbsolutePaths: true,
    })

    const code = await readFile(generatedRouteTree, 'utf8')
    const staticImports = parseSync('routeTree.gen.ts', code)
      .module.staticImports.map((statement) => statement.moduleRequest.value)
      .filter((specifier) => !specifier.startsWith('@'))
    expect(staticImports.length).toBe(3)
    for (const specifier of staticImports) {
      expect(path.isAbsolute(specifier)).toBe(true)
    }
    expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
  })

  test.each([
    {
      name: 'a function',
      routeTreeFileFooter: () => ['// footer', 'export const footer = 1'],
    },
    {
      name: 'an array',
      routeTreeFileFooter: ['// footer', 'export const footer = 1'],
    },
  ])(
    'routeTreeFileFooter as $name ends the route tree with its lines',
    async ({ routeTreeFileFooter }) => {
      const root = await createApp(app())
      const { generatedRouteTree } = await generate(root, {
        routeTreeFileFooter,
      })

      const code = await readFile(generatedRouteTree, 'utf8')
      expect(code.slice(code.indexOf('export const routeTree'))).toMatch(
        /\n\/\/ footer\n+export const footer = 1\n$/,
      )
      expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
    },
  )
})

describe('ignored route files', () => {
  test('with the default routeFileIgnorePrefix, "-" route files and directories are left out of the route tree and untouched', async () => {
    const notARoute = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({})
`
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
`,
      'src/routes/-disabled.tsx': notARoute,
      'src/routes/-components/card.tsx': notARoute,
      'src/routes/-empty.tsx': '',
    })
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
    })
    expect(await read(root, 'src/routes/-disabled.tsx')).toBe(notARoute)
    expect(await read(root, 'src/routes/-components/card.tsx')).toBe(notARoute)
    expect(await read(root, 'src/routes/-empty.tsx')).toBe('')
  })
})

describe.each(['react', 'solid', 'vue'] as const)('the %s target', (target) => {
  const routerPackage = `@tanstack/${target}-router`

  test(`the route tree imports its runtime from ${routerPackage}`, async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(target),
      // A lazy route without a route file: the route tree creates its route.
      'src/routes/about.lazy.tsx': `import { createLazyFileRoute } from '${routerPackage}'

export const Route = createLazyFileRoute('/about')({})
`,
    })
    const { generatedRouteTree } = await generate(root, { target })

    const code = await readFile(generatedRouteTree, 'utf8')
    const packages = parseSync('routeTree.gen.ts', code)
      .module.staticImports.map((statement) => statement.moduleRequest.value)
      .filter((specifier) => !specifier.startsWith('.'))
    expect(new Set(packages)).toEqual(new Set([routerPackage]))
    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': null,
    })
  })
})

describe('custom scaffolding', () => {
  test('customScaffolding in tsr.config.json scaffolds new route and lazy route files', async () => {
    const root = await createApp({
      'tsr.config.json': JSON.stringify({
        customScaffolding: {
          routeTemplate:
            '%%tsrImports%%\n\n%%tsrExportStart%%{ staticData: { template: "route" } }%%tsrExportEnd%%\n',
          lazyRouteTemplate:
            '%%tsrImports%%\n\n%%tsrExportStart%%{ staticData: { template: "lazy" } }%%tsrExportEnd%%\n',
        },
      }),
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': '',
      'src/routes/about.lazy.tsx': '',
    })
    await generate(root)

    const posts = await evaluateRouteFile(
      await read(root, 'src/routes/posts.tsx'),
    )
    expect([posts.Route.id, posts.Route.options.staticData]).toEqual([
      '/posts',
      { template: 'route' },
    ])
    const about = await evaluateRouteFile(
      await read(root, 'src/routes/about.lazy.tsx'),
    )
    expect([about.Route.id, about.Route.options.staticData]).toEqual([
      '/about',
      { template: 'lazy' },
    ])
  })
})

describe('token options', () => {
  test('a RegExp indexToken with the default routeToken generates index and layout routes', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts/route.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
      'src/routes/posts/page.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({})
`,
    })
    const { generatedRouteTree } = await generate(root, {
      indexToken: /^page$/,
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts/route.tsx',
      '/posts/': 'routes/posts/page.tsx',
    })
  })
})

describe('custom tokens matching longer names', () => {
  // The routeToken regex of the docs (file-based-routing.md: "filenames like
  // `dashboard.main-layout.tsx` ... would all be recognized as layout
  // routes") matches the whole name of a layout file.
  // Source: r5-gaps N11 (rg:2723: every name read as bracket-wrapped).
  test('a routeToken regex matching whole names makes such a file the layout route of its directory', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts/main-layout.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
      'src/routes/posts/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({})
`,
    })
    const { generatedRouteTree } = await generate(root, {
      routeToken: /[a-z]+-layout/,
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts/main-layout.tsx',
      '/posts/': 'routes/posts/index.tsx',
    })
  })
})

describe('route tree path', () => {
  test('the directories of a nested route tree path are created', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
    })
    const { generatedRouteTree } = await generate(root, {
      generatedRouteTree: './src/generated/deep/routeTree.gen.ts',
    })

    expect(generatedRouteTree).toBe(
      path.join(root, 'src/generated/deep/routeTree.gen.ts'),
    )
    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: '../../routes/__root.tsx',
    })
  })
})

describe('logging', () => {
  // (`disableLogging: true` silencing the logs is outside the compiler test
  // corpus: tests/outside-compiler-corpus/config-options.test.ts)
  test('with logging on, a run that scaffolds and skips route files names them', async () => {
    const output: Array<string> = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        output.push(args.join(' '))
      })
    }
    const root = await createApp({
      // An empty root route is scaffolded, with a log.
      'src/routes/__root.tsx': '',
      // A route file without a Route export is left out, with a warning.
      'src/routes/helpers.tsx': 'export const helper = 1\n',
      // An invalid param name gets a warning.
      'src/routes/$123.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$123')({})
`,
    })
    const { generatedRouteTree } = await generate(root, {
      disableLogging: false,
    })

    expect(existsSync(generatedRouteTree)).toBe(true)
    expect(output.join('\n')).toContain('__root.tsx')
    expect(output.join('\n')).toContain('helpers.tsx')
    expect(output.join('\n')).toContain('$123')
  })
})

/**
 * The local names of the values a module imports from `source`, in source
 * order.
 */
function valueImports(code: string, source: string) {
  const { module } = parseSync('route.tsx', code)
  return module.staticImports
    .filter((statement) => statement.moduleRequest.value === source)
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) => entry.localName.value),
    )
}

/**
 * The module without its BOM and its import declarations (each on its own
 * line).
 */
function withoutImports(code: string) {
  return code
    .replace(/^﻿/, '')
    .split(/(?<=\n)/)
    .filter((line) => !line.startsWith('import '))
    .join('')
}
