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
import {
  captureConsole,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { Generator, getConfig } from '../src'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf, routeIdOf } from './route-id'
import { routesOf, urlsOf, withRouteTree } from './route-tree'
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

  // (UTF-8 BOMs: outside the compiler test corpus, SPEC \u00A72.1 selects
  // BOM-free sources; tests/outside-compiler-corpus/bom.test.ts)
  test.each([
    {
      name: 'CRLF line endings',
      file: 'posts.tsx',
      source: postsRoute().replaceAll('\n', '\r\n'),
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
      // (the quote character of the edited id is free, SPEC J1.2)
      expectOnlyOwnedEdits(source, written, file)
      expect(routeCallOf(written, file)).toEqual({
        constructor: 'createFileRoute',
        id: '/posts',
      })
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/posts': `routes/${file}`,
      })
    },
  )

  describe.each(['react', 'solid', 'vue'] as const)('target %s', (target) => {
    const routerPackage = `@tanstack/${target}-router`

    test.each([
      { name: 'LF', newline: '\n' },
      { name: 'CRLF', newline: '\r\n' },
    ])(
      'a lazy route file created with createFileRoute gets createLazyFileRoute, with $name',
      async ({ newline }) => {
        const source = `import { Link, createFileRoute } from '${routerPackage}'

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
        // Only the constructor changes: `Link` stays bound, and the now
        // unused `createFileRoute` import may stay or go (SPEC J1.2).
        expectOnlyOwnedEdits(source, written)
        expect(
          valueImports(written, routerPackage).filter(
            (name) => name === 'createLazyFileRoute',
          ),
        ).toHaveLength(1)
        expect(routeCallOf(written)).toEqual({
          constructor: 'createLazyFileRoute',
          id: '/posts',
        })
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
      expect(routeCallOf(written)).toEqual({
        constructor: 'createFileRoute',
        id: '/posts',
      })
      // (`Link` stays bound: expectOnlyOwnedEdits)
      expectOnlyOwnedEdits(source, written)
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
    for (const [file, id] of [
      ['café.tsx', '/café'],
      ['日本語.$id.tsx', '/日本語/$id'],
    ] as const) {
      const written = await read(root, `src/routes/${file}`)
      expectOnlyOwnedEdits(route, written)
      expect(routeCallOf(written)).toEqual({
        constructor: 'createFileRoute',
        id,
      })
    }
  })

  // (A route file starting with a UTF-8 BOM: outside the compiler test
  // corpus, tests/outside-compiler-corpus/bom.test.ts.)
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
   * The imports of the app's route files in a route tree, static and
   * dynamic: route file (relative to the app, without its extension) to
   * the specifiers that import it. Imports of other modules (packages,
   * generated support modules) are left out: the options are about the
   * route files.
   */
  async function routeFileImports(
    root: string,
    treeFile: string,
    files: Array<string>,
    kinds: Array<'static' | 'dynamic'> = ['static', 'dynamic'],
  ) {
    const code = await readFile(treeFile, 'utf8')
    const { module } = parseSync(path.basename(treeFile), code)
    const specifiers = [
      ...(kinds.includes('static')
        ? module.staticImports.map((statement) => statement.moduleRequest.value)
        : []),
      ...(kinds.includes('dynamic')
        ? module.dynamicImports.map((statement) =>
            code
              .slice(statement.moduleRequest.start, statement.moduleRequest.end)
              .slice(1, -1),
          )
        : []),
    ]
    const withoutExtension = (file: string) => file.replace(/\.[^./]+$/, '')
    const imports: Record<string, Array<string>> = Object.fromEntries(
      files.map((file) => [withoutExtension(file), []]),
    )
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
        continue
      }
      const file = withoutExtension(
        path
          .relative(root, path.resolve(path.dirname(treeFile), specifier))
          .replaceAll(path.sep, '/'),
      )
      imports[file]?.push(specifier)
    }
    return imports
  }

  /** The route files of `app()`. */
  const appFiles = (ext = 'tsx') =>
    Object.keys(app(ext)).filter((file) => file.startsWith('src/routes/'))

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
      // The quotes of the string literals without quote characters in them
      // (a printer may quote the others either way to avoid escapes).
      const quotes = new Set<string>()
      const visit = (node: unknown) => {
        if (Array.isArray(node)) {
          node.forEach(visit)
        } else if (node && typeof node === 'object') {
          const { type, value, raw } = node as Record<string, unknown>
          if (
            type === 'Literal' &&
            typeof value === 'string' &&
            !/["']/.test(value)
          ) {
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

    const imports = await routeFileImports(root, generatedRouteTree, appFiles())
    for (const [file, specifiers] of Object.entries(imports)) {
      expect(specifiers.length, file).toBeGreaterThan(0)
      for (const specifier of specifiers) {
        expect(specifier).toMatch(/\.tsx$/)
        expect(
          existsSync(path.resolve(path.dirname(generatedRouteTree), specifier)),
        ).toBe(true)
      }
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

      const imports = await routeFileImports(
        root,
        generatedRouteTree,
        appFiles(),
      )
      for (const [file, specifiers] of Object.entries(imports)) {
        expect(specifiers.length, file).toBeGreaterThan(0)
        for (const specifier of specifiers) {
          expect(specifier).toMatch(/[^.]\.js$/)
        }
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

    // (the static imports of the route files; the lazy file: below)
    const imports = await routeFileImports(
      root,
      generatedRouteTree,
      appFiles().filter((file) => !file.includes('.lazy.')),
      ['static'],
    )
    for (const [file, specifiers] of Object.entries(imports)) {
      expect(specifiers.length, file).toBeGreaterThan(0)
      for (const specifier of specifiers) {
        expect(path.isAbsolute(specifier), specifier).toBe(true)
      }
    }
    expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
  })

  // Bug: with importRoutesUsingAbsolutePaths, the route tree still imports
  // lazy route files (and lazy components) by paths relative to itself;
  // only the eager route file imports are absolute.
  // Source: src/generator.ts (the `.lazy(() => import('./…'))` and
  // `lazyRouteComponent(() => import('./…'))` templates ignore the option;
  // src/utils.ts `getImportForRouteNode` honours it for static imports).
  // Impact: the option holds for eager routes only; whatever needs the
  // tree's route imports to be absolute (a tree evaluated from another
  // location than the one it was generated for) still gets relative imports
  // for every lazy route.
  test.fails(
    'importRoutesUsingAbsolutePaths imports the lazy route files by absolute paths too',
    async () => {
      const root = await createApp(app())
      const { generatedRouteTree } = await generate(root, {
        importRoutesUsingAbsolutePaths: true,
      })

      // (static imports of the route files and dynamic ones of the lazy file)
      const imports = await routeFileImports(
        root,
        generatedRouteTree,
        appFiles(),
      )
      for (const [file, specifiers] of Object.entries(imports)) {
        expect(specifiers.length, file).toBeGreaterThan(0)
        for (const specifier of specifiers) {
          expect(path.isAbsolute(specifier), specifier).toBe(true)
        }
      }
      expect(await routesOf(generatedRouteTree)).toEqual(appRoutes())
    },
  )

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

      const lines = (await readFile(generatedRouteTree, 'utf8'))
        .split('\n')
        .filter((line) => line.trim() !== '')
      expect(lines.slice(-2)).toEqual(['// footer', 'export const footer = 1'])
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

  // An empty routeFileIgnorePrefix ignores nothing by prefix: a "-" file is
  // a route like any other. Source: V4 round 2 escape astra-r2/03 (the
  // default "-" restored for an empty prefix).
  test('with an empty routeFileIgnorePrefix, a "-" route file is a route', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/-health.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({})
`,
    })
    const { generatedRouteTree } = await generate(root, {
      routeFileIgnorePrefix: '',
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/-health': 'routes/-health.tsx',
    })
    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/-health': '/-health',
    })
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
  // The lazy template uses an option a lazy route takes (`component`;
  // `staticData` is no option of createLazyFileRoute: tsc TS2353,
  // api/router/createLazyFileRouteFunction.md:22-28).
  test('customScaffolding in tsr.config.json scaffolds new route and lazy route files', async () => {
    const root = await createApp({
      'tsr.config.json': JSON.stringify({
        customScaffolding: {
          routeTemplate:
            '%%tsrImports%%\n\n%%tsrExportStart%%{ staticData: { template: "route" } }%%tsrExportEnd%%\n',
          lazyRouteTemplate:
            '%%tsrImports%%\n\n%%tsrExportStart%%{ component: () => "lazy template" }%%tsrExportEnd%%\n',
        },
      }),
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': '',
      'src/routes/about.lazy.tsx': '',
    })
    const { generatedRouteTree } = await generate(root)

    for (const [file, constructor, id] of [
      ['posts.tsx', 'createFileRoute', '/posts'],
      ['about.lazy.tsx', 'createLazyFileRoute', '/about'],
    ]) {
      expect(routeCallOf(await read(root, `src/routes/${file}`))).toEqual({
        constructor,
        id,
      })
    }
    await withRouteTree(generatedRouteTree, async ({ router, renderAt }) => {
      expect(router.routesById['/posts']!.options.staticData).toEqual({
        template: 'route',
      })
      expect(await renderAt('/about')).toContain('lazy template')
    })
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

  // A token RegExp keeps its flags' meaning: `\p{L}` needs the `u` flag.
  // Source: V4 round 2 escape astra-r2/01 (the `u` flag dropped).
  test('a Unicode-mode routeToken regex makes a file with a non-ASCII name the layout route of its directory', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts/écran-layout.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
      'src/routes/posts/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({})
`,
    })
    const { generatedRouteTree } = await generate(root, {
      routeToken: /\p{L}+-layout/u,
    })

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/posts': '/posts',
      '/posts/': '/posts/',
    })
    expect((await routesOf(generatedRouteTree))['/posts']).toBe(
      'routes/posts/écran-layout.tsx',
    )
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
  /**
   * An app whose run scaffolds a route file (an empty root route) and skips
   * one (a route file without a Route export).
   */
  const app = () => ({
    'src/routes/__root.tsx': '',
    'src/routes/helpers.tsx': 'export const helper = 1\n',
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
`,
  })

  // A route file without a Route export is left out with a warning naming it
  // (SPEC J1.12, G5); what else the run logs is free.
  test('with logging on, a route file without a Route export is left out with a warning naming it', async () => {
    const root = await createApp(app())
    const { result: config, diagnostics } = await captureConsole(() =>
      generate(root, { disableLogging: false }),
    )

    expectDiagnostic(diagnostics, {
      severity: ['warning', 'error'],
      file: path.join(root, 'src/routes/helpers.tsx'),
      root,
    })
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
    })
  })

  // `disableLogging` silences the route generation logging (SPEC J1.12) on
  // every console channel, whatever its severity; actionable diagnostics
  // about the input stay allowed (G5): here, only ones naming the route
  // file without a Route export.
  test('with disableLogging, a run that scaffolds and skips route files logs no route generation messages', async () => {
    const root = await createApp(app())
    const { result: config, diagnostics } = await captureConsole(() =>
      generate(root, { disableLogging: true }),
    )

    const actionable = findDiagnostics(diagnostics, {
      file: path.join(root, 'src/routes/helpers.tsx'),
      root,
    })
    expect(
      diagnostics.filter((diagnostic) => !actionable.includes(diagnostic)),
      'the messages not about the route file without a Route export',
    ).toEqual([])
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
    })
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
