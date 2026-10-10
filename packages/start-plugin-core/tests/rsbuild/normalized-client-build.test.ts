import { describe, expect, test, vi } from 'vitest'
import {
  normalizeRspackClientBuild,
  registerClientBuildCapture,
} from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { GetConfigFn, NormalizedClientChunk } from '../../src/types'

function makeCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const routeModule = {
    identifier: () => '/routes/posts.tsx?tsr-split=component',
    nameForCondition: () => '/routes/posts.tsx',
  }
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    modules: new Set([routeModule]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk ? [routeModule] : [],
      getModuleChunks: (module: unknown) =>
        module === routeModule ? [routeChunk] : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

// Rspack reports module paths using the OS native separator on Windows
// (e.g. `C:\app\src\routes\posts.tsx`), while the generated route tree always
// records `filePath` with POSIX separators. This compilation mimics that
// Windows output so we can verify the route still keys its chunk correctly.
function makeWindowsCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const routeModule = {
    identifier: () =>
      'builtin:swc-loader??ruleSet[0]!C:\\app\\src\\routes\\posts.tsx?tsr-split=component',
    nameForCondition: () => 'C:\\app\\src\\routes\\posts.tsx',
  }
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    modules: new Set([routeModule]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk ? [routeModule] : [],
      getModuleChunks: (module: unknown) =>
        module === routeModule ? [routeChunk] : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

type MockChunk = {
  name: string
  files: Set<string>
  auxiliaryFiles: Set<string>
  groupsIterable: Set<MockChunkGroup>
}
type MockChunkGroup = {
  chunks: Array<MockChunk>
  childrenIterable: Set<MockChunkGroup>
}

// The entry group lazy-loads the posts and about routes, which share a chunk.
// The posts route lazy-loads the post route, which contains a hydration island.
function makeChunkGraph() {
  const chunk = (
    name: string,
    files: Array<string>,
    auxiliaryFiles: Array<string> = [],
  ): MockChunk => ({
    name,
    files: new Set(files),
    auxiliaryFiles: new Set(auxiliaryFiles),
    groupsIterable: new Set(),
  })
  const group = (
    chunks: Array<MockChunk>,
    children: Array<MockChunkGroup> = [],
  ): MockChunkGroup => {
    const chunkGroup = { chunks, childrenIterable: new Set(children) }
    for (const member of chunks) {
      member.groupsIterable.add(chunkGroup)
    }
    return chunkGroup
  }

  const index = chunk('index', [
    'index.js',
    'index.abc123.hot-update.js',
    'root.css',
  ])
  const vendor = chunk('vendor', ['vendor.js'])
  const shared = chunk('shared', ['shared.js', 'shared.abc123.hot-update.js'])
  const posts = chunk('posts', ['posts.js'], ['posts.css'])
  const about = chunk('about', ['about.js'])
  const post = chunk('post', ['post.js'])
  const postGroup = group([post])
  const postsGroup = group([shared, posts], [postGroup])
  const aboutGroup = group([shared, about])
  const entryGroup = group([vendor, index], [postsGroup, aboutGroup])

  const moduleChunks = new Map<object, Array<MockChunk>>([
    [
      {
        identifier: () => '/routes/posts.tsx?tsr-split=component',
        nameForCondition: () => '/routes/posts.tsx',
      },
      [posts],
    ],
    [{ identifier: () => '/islands/counter.tsx?tss-hydrate=counter' }, [post]],
    [{ identifier: () => '/shared.ts' }, [shared]],
  ])
  const getChunkModules = vi.fn((target: MockChunk) =>
    Array.from(moduleChunks.keys()).filter((mod) =>
      moduleChunks.get(mod)!.includes(target),
    ),
  )
  const chunks = [index, vendor, shared, posts, about, post]
  const compilation = {
    entrypoints: new Map([['index', entryGroup]]),
    chunks: new Set(chunks),
    modules: new Set(moduleChunks.keys()),
    chunkGraph: {
      getChunkModules,
      getModuleChunks: (mod: object) => moduleChunks.get(mod) ?? [],
    },
  } as unknown as Rspack.Compilation

  return {
    compilation,
    getChunkModules,
    graphObjects: [...chunks, postGroup, postsGroup, aboutGroup, entryGroup],
  }
}

// Counts reads of the chunk and chunk group properties that build a new
// collection on every read in Rspack. Returns the highest count for any one
// property of any one object.
function trackGraphPropertyReads(graphObjects: Array<object>) {
  let maxReads = 0
  for (const graphObject of graphObjects) {
    for (const key of [
      'files',
      'auxiliaryFiles',
      'groupsIterable',
      'chunks',
      'childrenIterable',
    ]) {
      if (!(key in graphObject)) {
        continue
      }
      const value: unknown = Reflect.get(graphObject, key)
      let reads = 0
      Object.defineProperty(graphObject, key, {
        get() {
          reads += 1
          maxReads = Math.max(maxReads, reads)
          return value
        },
      })
    }
  }
  return () => maxReads
}

function expectedChunk(
  fileName: string,
  fields: Partial<NormalizedClientChunk> = {},
): NormalizedClientChunk {
  return {
    fileName,
    isEntry: false,
    imports: [],
    dynamicImports: [],
    css: [],
    routeFilePaths: [],
    hydrationIds: [],
    ...fields,
  }
}

describe('normalizeRspackClientBuild', () => {
  test('lists imports and dynamic imports from chunk groups in first-seen order', () => {
    const { compilation } = makeChunkGraph()
    const clientBuild = normalizeRspackClientBuild(compilation)
    const lazyRoutes = ['shared.js', 'posts.js', 'about.js']

    expect(clientBuild.entryChunkFileName).toBe('index.js')
    expect(Array.from(clientBuild.chunksByFileName.values())).toEqual([
      expectedChunk('index.js', {
        isEntry: true,
        imports: ['vendor.js'],
        dynamicImports: lazyRoutes,
        css: ['root.css'],
      }),
      expectedChunk('vendor.js', {
        imports: ['index.js'],
        dynamicImports: lazyRoutes,
      }),
      expectedChunk('shared.js', {
        imports: ['posts.js', 'about.js'],
        dynamicImports: ['post.js'],
      }),
      expectedChunk('posts.js', {
        imports: ['shared.js'],
        dynamicImports: ['post.js'],
        css: ['posts.css'],
        routeFilePaths: ['/routes/posts.tsx'],
      }),
      expectedChunk('about.js', { imports: ['shared.js'] }),
      expectedChunk('post.js', { hydrationIds: ['counter'] }),
    ])
  })

  test('reads modules only from chunks with a route-split or hydration module', () => {
    const { compilation, getChunkModules } = makeChunkGraph()
    normalizeRspackClientBuild(compilation)

    expect(
      new Set(getChunkModules.mock.calls.map(([target]) => target.name)),
    ).toEqual(new Set(['posts', 'post']))
  })

  test('reads each chunk and chunk group property at most once', () => {
    const { compilation, graphObjects } = makeChunkGraph()
    const maxReads = trackGraphPropertyReads(graphObjects)
    normalizeRspackClientBuild(compilation)

    // 1, not 0, also confirms the read counters were installed.
    expect(maxReads()).toBe(1)
  })

  test('keeps route stylesheet links with inline CSS disabled by default', () => {
    const compilation = makeCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: '/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.inlineCss).toBeUndefined()
  })

  test.each([
    { action: 'build', enabled: false, captureCss: false },
    { action: 'build', enabled: true, captureCss: true },
    { action: 'dev', enabled: false, captureCss: false },
    { action: 'dev', enabled: true, captureCss: false },
  ])(
    'captures inline CSS according to the action and resolved config ($action, $enabled)',
    ({ action, enabled, captureCss }) => {
      const compilation = makeCompilation(() =>
        Buffer.from('.card{background:url(./dot.svg)}'),
      )
      const processAssets = vi.fn<RsbuildPluginAPI['processAssets']>()
      const getConfig = () => ({
        startConfig: { server: { build: { inlineCss: { enabled } } } },
      })
      const { getClientBuild } = registerClientBuildCapture(
        { context: { action }, processAssets } as unknown as RsbuildPluginAPI,
        getConfig as unknown as GetConfigFn,
      )

      const [, capture] = processAssets.mock.calls[0]!
      capture({ compilation } as Parameters<typeof capture>[0])

      const clientBuild = getClientBuild()!
      const manifest = buildStartManifest({
        clientBuild,
        routeTreeRoutes: {
          __root__: {},
          '/posts': { filePath: '/routes/posts.tsx' },
        },
        basePath: '/assets',
        inlineCss: { enabled: captureCss, transformAssets: false },
      })

      expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
      expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
      if (captureCss) {
        expect(manifest.inlineCss?.styles).toEqual({
          '/assets/root.css': '.card{background:url(/assets/dot.svg)}',
          '/assets/posts.css': '.card{background:url(/assets/dot.svg)}',
        })
      } else {
        expect(manifest.inlineCss).toBeUndefined()
      }
    },
  )

  test('keys the route chunk by a POSIX path when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)

    expect(
      clientBuild.chunksByFileName.get('posts.js')?.routeFilePaths,
    ).toEqual(['C:/app/src/routes/posts.tsx'])
  })

  test('gives a route its stylesheet and preload when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: 'C:/app/src/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.routes['/posts']?.preloads).toEqual(['/assets/posts.js'])
  })
})
