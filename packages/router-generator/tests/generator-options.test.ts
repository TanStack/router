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
        expect(written).toBe(
          source.replaceAll('createFileRoute', 'createLazyFileRoute'),
        )
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

  test('a route file starting with a hashbang keeps it', async () => {
    const source = `#!/usr/bin/env node
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({})
`
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': source,
    })
    const { generatedRouteTree } = await generate(root)

    expect(await read(root, 'src/routes/posts.tsx')).toBe(
      source.replace('/old', '/posts'),
    )
    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts.tsx',
    })
  })

  // Control: "a route file without the route constructor import gets it from
  // @tanstack/react-router" above (same harness, without the prefix).

  // Bug: the generator adds a missing route constructor import at the very
  // start of the file, before a hashbang or a UTF-8 BOM.
  // Source: src/transform/transform.ts:560 (`s.prepend` of the import).
  // Impact: a hashbang that is no longer on the first line is a syntax
  // error, so the route file fails to build; a BOM ends up after the import,
  // as a stray zero-width character on the second line, and the file no
  // longer starts with it.
  test.fails.each([
    { name: 'a hashbang', prefix: '#!/usr/bin/env node\n' },
    { name: 'a UTF-8 BOM', prefix: '\uFEFF' },
  ])(
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

/** The module without its import declarations (each on its own line). */
function withoutImports(code: string) {
  return code
    .split(/(?<=\n)/)
    .filter((line) => !line.startsWith('import '))
    .join('')
}
