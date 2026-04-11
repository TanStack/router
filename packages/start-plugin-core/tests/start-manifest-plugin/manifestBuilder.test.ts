import { describe, expect, test } from 'vitest'
import { deserialize } from 'seroval'
import {
  appendUniqueAssets,
  appendUniqueStrings,
  buildStartManifest,
  collectDynamicImportCss,
  createChunkCssAssetCollector,
  createManifestAssetResolvers,
  getRouteFilePathsFromModuleIds,
  normalizeViteClientBuild,
  normalizeViteClientChunk,
  serializeStartManifest,
  scanClientChunks,
  type StartManifest,
} from '../../src/start-manifest-plugin/manifestBuilder'
import type { Rollup } from 'vite'

function normalizeTestBuild(bundle: Rollup.OutputBundle) {
  return normalizeViteClientBuild(bundle)
}

function normalizeTestChunk(chunk: Rollup.OutputChunk) {
  return normalizeViteClientChunk(chunk)
}

function deserializeSerializedManifest(serialized: string): StartManifest {
  return deserialize(serialized) as StartManifest
}

function makeChunk(options: {
  fileName: string
  imports?: Array<string>
  dynamicImports?: Array<string>
  importedCss?: Array<string>
  moduleIds?: Array<string>
  isEntry?: boolean
}): Rollup.OutputChunk {
  return {
    type: 'chunk',
    fileName: options.fileName,
    name: options.fileName,
    imports: options.imports ?? [],
    dynamicImports: options.dynamicImports ?? [],
    moduleIds: options.moduleIds ?? [],
    isEntry: options.isEntry ?? false,
    isDynamicEntry: false,
    facadeModuleId: null,
    implicitlyLoadedBefore: [],
    importedBindings: {},
    modules: {},
    referencedFiles: [],
    code: '',
    map: null,
    exports: [],
    preliminarilyFileName: options.fileName,
    viteMetadata: {
      importedCss: new Set(options.importedCss ?? []),
      importedAssets: new Set(),
    },
  } as unknown as Rollup.OutputChunk
}

describe('getRouteFilePathsFromModuleIds', () => {
  test('returns unique route file paths only for tsr split modules', () => {
    expect(
      getRouteFilePathsFromModuleIds([
        '/routes/posts.tsx?tsr-split=component',
        '/routes/posts.tsx?tsr-split=loader',
        '/routes/index.tsx?foo=bar',
        '/routes/users.tsx?foo=bar&tsr-split=component',
      ]),
    ).toEqual(['/routes/posts.tsx', '/routes/users.tsx'])
  })

  test('returns empty array for empty input', () => {
    expect(getRouteFilePathsFromModuleIds([])).toEqual([])
  })

  test('returns empty array when no module has query string', () => {
    expect(
      getRouteFilePathsFromModuleIds([
        '/routes/posts.tsx',
        '/routes/index.tsx',
      ]),
    ).toEqual([])
  })

  test('returns empty array when no module has tsr-split param', () => {
    expect(
      getRouteFilePathsFromModuleIds([
        '/routes/posts.tsx?foo=bar',
        '/routes/index.tsx?baz=qux',
      ]),
    ).toEqual([])
  })
})

describe('appendUniqueStrings', () => {
  test('preserves order while appending only new values', () => {
    expect(appendUniqueStrings(['a', 'b'], ['b', 'c', 'a', 'd'])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  test('returns original target array when nothing new is appended', () => {
    const target = ['a', 'b']

    expect(appendUniqueStrings(target, ['b', 'a'])).toBe(target)
  })

  test('returns source array when target is empty', () => {
    const source = ['a', 'b']

    expect(appendUniqueStrings(undefined, source)).toBe(source)
  })
})

describe('appendUniqueAssets', () => {
  test('dedupes by asset identity while preserving order', () => {
    const baseAsset = {
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: '/assets/a.css',
        type: 'text/css',
      },
    } as const
    const duplicateAsset = {
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: '/assets/a.css',
        type: 'text/css',
      },
    } as const
    const newAsset = {
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: '/assets/b.css',
        type: 'text/css',
      },
    } as const

    expect(appendUniqueAssets([baseAsset], [duplicateAsset, newAsset])).toEqual(
      [baseAsset, newAsset],
    )
  })

  test('returns original target array when nothing new is appended', () => {
    const target = [
      {
        tag: 'link' as const,
        attrs: {
          rel: 'stylesheet',
          href: '/assets/a.css',
          type: 'text/css',
        },
      },
    ]

    expect(
      appendUniqueAssets(target, [
        {
          tag: 'link' as const,
          attrs: {
            rel: 'stylesheet',
            href: '/assets/a.css',
            type: 'text/css',
          },
        },
      ]),
    ).toBe(target)
  })
})

describe('scanClientChunks', () => {
  test('collects entry chunk and route chunk mappings', () => {
    const entryChunk = makeChunk({ fileName: 'entry.js', isEntry: true })
    const routeChunk = makeChunk({
      fileName: 'posts.js',
      moduleIds: ['/routes/posts.tsx?tsr-split=component'],
    })

    const normalizedBuild = normalizeTestBuild({
      'entry.js': entryChunk,
      'posts.js': routeChunk,
    })
    const scanned = scanClientChunks(normalizedBuild)

    expect(scanned.entryChunk).toBe(
      normalizedBuild.chunksByFileName.get('entry.js'),
    )
    expect(
      scanned.routeEntryChunks.has(
        normalizedBuild.chunksByFileName.get('posts.js')!,
      ),
    ).toBe(true)
    expect(scanned.routeChunksByFilePath.get('/routes/posts.tsx')).toEqual([
      normalizedBuild.chunksByFileName.get('posts.js')!,
    ])
  })

  test('throws when no entry chunk exists', () => {
    const routeChunk = makeChunk({
      fileName: 'posts.js',
      moduleIds: ['/routes/posts.tsx?tsr-split=component'],
    })

    expect(() =>
      scanClientChunks(normalizeTestBuild({ 'posts.js': routeChunk })),
    ).toThrow('No entry file found')
  })
})

describe('collectDynamicImportCss', () => {
  test('collects css reachable through dynamic imports only', () => {
    const routeChunk = makeChunk({
      fileName: 'route.js',
      dynamicImports: ['lazy.js'],
      importedCss: ['route.css'],
    })
    const lazyChunk = makeChunk({
      fileName: 'lazy.js',
      imports: ['shared.js'],
      importedCss: ['lazy.css'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })
    const dynamicCss = collectDynamicImportCss(
      new Set([normalizeTestChunk(routeChunk)]),
      new Map([
        ['route.js', normalizeTestChunk(routeChunk)],
        ['lazy.js', normalizeTestChunk(lazyChunk)],
        ['shared.js', normalizeTestChunk(sharedChunk)],
      ]),
    )

    expect(Array.from(dynamicCss)).toEqual([])
  })

  test('ignores CSS shared only across router-managed routes', () => {
    const routeA = makeChunk({
      fileName: 'routeA.js',
      imports: ['shared.js'],
      moduleIds: ['/routes/a.tsx?tsr-split=component'],
    })
    const routeB = makeChunk({
      fileName: 'routeB.js',
      imports: ['shared.js'],
      moduleIds: ['/routes/b.tsx?tsr-split=component'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })
    const dynamicCss = collectDynamicImportCss(
      new Set([normalizeTestChunk(routeA), normalizeTestChunk(routeB)]),
      new Map([
        ['routeA.js', normalizeTestChunk(routeA)],
        ['routeB.js', normalizeTestChunk(routeB)],
        ['shared.js', normalizeTestChunk(sharedChunk)],
      ]),
    )

    expect(dynamicCss.has('shared.css')).toBe(false)
  })

  test('collects css reachable through both router-managed and non-route dynamic imports', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      dynamicImports: ['lazy.js'],
    })
    const routeChunk = makeChunk({
      fileName: 'route.js',
      imports: ['shared.js'],
      moduleIds: ['/routes/home.tsx?tsr-split=component'],
    })
    const lazyChunk = makeChunk({
      fileName: 'lazy.js',
      imports: ['shared.js'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })

    const normalizedBuild = normalizeTestBuild({
      'entry.js': entryChunk,
      'route.js': routeChunk,
      'lazy.js': lazyChunk,
      'shared.js': sharedChunk,
    })
    const dynamicCss = collectDynamicImportCss(
      new Set([normalizedBuild.chunksByFileName.get('route.js')!]),
      normalizedBuild.chunksByFileName,
      normalizedBuild.chunksByFileName.get('entry.js'),
    )

    expect(dynamicCss.has('shared.css')).toBe(true)
  })
})

describe('createManifestAssetResolvers + createChunkCssAssetCollector', () => {
  test('reuses cached stylesheet assets and appends hash for dynamic css', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      imports: ['shared.js'],
      importedCss: ['entry.css'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })
    const chunksByFileName = new Map([
      ['entry.js', normalizeTestChunk(entryChunk)],
      ['shared.js', normalizeTestChunk(sharedChunk)],
    ])

    const resolvers = createManifestAssetResolvers({
      basePath: '/assets',
      hashedCssFiles: new Set(['shared.css']),
    })
    const cssAssetCollector = createChunkCssAssetCollector({
      chunksByFileName,
      getStylesheetAsset: resolvers.getStylesheetAsset,
    })

    const assets = cssAssetCollector.getChunkCssAssets(
      chunksByFileName.get('entry.js')!,
    )

    expect(assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/entry.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/shared.css#',
          type: 'text/css',
        },
      },
    ])

    expect(resolvers.getStylesheetAsset('shared.css')).toBe(
      resolvers.getStylesheetAsset('shared.css'),
    )
  })
})

describe('createChunkCssAssetCollector', () => {
  test('dedupes css from shared imported chunks', () => {
    const chunkA = makeChunk({
      fileName: 'a.js',
      imports: ['b.js', 'c.js'],
      importedCss: ['a.css'],
    })
    const chunkB = makeChunk({
      fileName: 'b.js',
      imports: ['shared.js'],
      importedCss: ['b.css'],
    })
    const chunkC = makeChunk({
      fileName: 'c.js',
      imports: ['shared.js'],
      importedCss: ['c.css'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })
    const chunksByFileName = new Map([
      ['a.js', normalizeTestChunk(chunkA)],
      ['b.js', normalizeTestChunk(chunkB)],
      ['c.js', normalizeTestChunk(chunkC)],
      ['shared.js', normalizeTestChunk(sharedChunk)],
    ])

    const { getChunkCssAssets } = createChunkCssAssetCollector({
      chunksByFileName,
      getStylesheetAsset: (cssFile) => ({
        tag: 'link',
        attrs: { rel: 'stylesheet', href: `/${cssFile}`, type: 'text/css' },
      }),
    })

    const assets = getChunkCssAssets(chunksByFileName.get('a.js')!)

    expect(assets.map((asset: any) => asset.attrs.href)).toEqual([
      '/a.css',
      '/b.css',
      '/shared.css',
      '/c.css',
    ])
  })

  test('handles circular chunk imports without infinite recursion', () => {
    const chunkA = makeChunk({
      fileName: 'a.js',
      imports: ['b.js'],
      importedCss: ['a.css'],
    })
    const chunkB = makeChunk({
      fileName: 'b.js',
      imports: ['a.js'],
      importedCss: ['b.css'],
    })
    const chunksByFileName = new Map([
      ['a.js', normalizeTestChunk(chunkA)],
      ['b.js', normalizeTestChunk(chunkB)],
    ])

    const { getChunkCssAssets } = createChunkCssAssetCollector({
      chunksByFileName,
      getStylesheetAsset: (cssFile) => ({
        tag: 'link',
        attrs: { rel: 'stylesheet', href: `/${cssFile}`, type: 'text/css' },
      }),
    })

    const assets = getChunkCssAssets(chunksByFileName.get('a.js')!)
    const hrefs = assets.map((a: any) => a.attrs.href)

    expect(hrefs).toContain('/a.css')
    expect(hrefs).toContain('/b.css')
    // No infinite recursion — test completes
  })
})

describe('buildStartManifest', () => {
  test('dedupes route css gathered through overlapping chunk imports', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
    })
    const routeChunk = makeChunk({
      fileName: 'route.js',
      imports: ['branch-a.js', 'branch-b.js'],
      moduleIds: ['/routes/about.tsx?tsr-split=component'],
    })
    const branchAChunk = makeChunk({
      fileName: 'branch-a.js',
      imports: ['shared.js'],
      importedCss: ['branch-a.css'],
    })
    const branchBChunk = makeChunk({
      fileName: 'branch-b.js',
      imports: ['shared.js'],
      importedCss: ['branch-b.css'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'route.js': routeChunk,
        'branch-a.js': branchAChunk,
        'branch-b.js': branchBChunk,
        'shared.js': sharedChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/about'] } as any,
        '/about': { filePath: '/routes/about.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/about']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/branch-a.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/shared.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/branch-b.css',
          type: 'text/css',
        },
      },
    ])
  })

  test('hashes css shared by route chunks and nested non-route dynamic imports', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      dynamicImports: ['route-lazy.js'],
      importedCss: ['entry.css'],
    })
    const routeStaticChunk = makeChunk({
      fileName: 'route-static.js',
      imports: ['widget.js'],
      moduleIds: ['/routes/static.tsx?tsr-split=component'],
    })
    const routeLazyChunk = makeChunk({
      fileName: 'route-lazy.js',
      dynamicImports: ['widget-lazy.js'],
      moduleIds: ['/routes/lazy.tsx?tsr-split=component'],
    })
    const widgetChunk = makeChunk({
      fileName: 'widget.js',
      importedCss: ['widget.css'],
    })
    const widgetLazyChunk = makeChunk({
      fileName: 'widget-lazy.js',
      imports: ['widget.js'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'route-static.js': routeStaticChunk,
        'route-lazy.js': routeLazyChunk,
        'widget.js': widgetChunk,
        'widget-lazy.js': widgetLazyChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/static', '/lazy'] } as any,
        '/static': { filePath: '/routes/static.tsx' },
        '/lazy': { filePath: '/routes/lazy.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.clientEntry).toBe('/assets/entry.js')
    expect(manifest.routes.__root__!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/entry.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/static']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/widget.css#',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/lazy']!.preloads).toEqual([
      '/assets/route-lazy.js',
    ])
  })

  test('dedupes route css already owned by ancestor routes', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      imports: ['shared.js'],
      dynamicImports: ['about.js'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['main.css'],
    })
    const aboutChunk = makeChunk({
      fileName: 'about.js',
      imports: ['shared.js'],
      importedCss: ['about.css'],
      moduleIds: ['/routes/about.tsx?tsr-split=component'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'shared.js': sharedChunk,
        'about.js': aboutChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/about'] } as any,
        '/about': { filePath: '/routes/about.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/main.css',
          type: 'text/css',
        },
      },
    ])

    expect(manifest.routes['/about']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/about.css',
          type: 'text/css',
        },
      },
    ])
  })

  test('adds hash only when css is shared by router-managed and non-route dynamic imports', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      dynamicImports: ['global-lazy.js'],
    })
    const routeChunk = makeChunk({
      fileName: 'route.js',
      imports: ['shared.js'],
      moduleIds: ['/routes/about.tsx?tsr-split=component'],
    })
    const sharedChunk = makeChunk({
      fileName: 'shared.js',
      importedCss: ['shared.css'],
    })
    const globalLazyChunk = makeChunk({
      fileName: 'global-lazy.js',
      imports: ['shared.js'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'route.js': routeChunk,
        'shared.js': sharedChunk,
        'global-lazy.js': globalLazyChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/about'] } as any,
        '/about': { filePath: '/routes/about.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/about']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/shared.css#',
          type: 'text/css',
        },
      },
    ])
  })

  test('serializeStartManifest preserves shared asset identity across routes', () => {
    const sharedAsset = {
      tag: 'link' as const,
      attrs: {
        rel: 'stylesheet',
        href: '/assets/shared.css',
        type: 'text/css',
      },
    }
    const manifest: StartManifest = {
      routes: {
        __root__: {
          children: ['/a', '/b', '/c'],
        },
        '/a': { assets: [sharedAsset], preloads: ['/assets/a.js'] },
        '/b': { assets: [sharedAsset], preloads: ['/assets/b.js'] },
        '/c': { assets: [sharedAsset], preloads: ['/assets/c.js'] },
      },
      clientEntry: '/assets/entry.js',
    }

    const evaluated = deserializeSerializedManifest(
      serializeStartManifest(manifest),
    )

    const aAsset = evaluated.routes['/a']?.assets?.[0]
    const bAsset = evaluated.routes['/b']?.assets?.[0]
    const cAsset = evaluated.routes['/c']?.assets?.[0]

    expect(aAsset).toBeDefined()
    expect(aAsset).toBe(bAsset)
    expect(bAsset).toBe(cAsset)
  })

  test('serializeStartManifest preserves non-asset fields unchanged', () => {
    const manifest: StartManifest = {
      routes: {
        __root__: {
          children: ['/posts'],
          preloads: ['/assets/root.js'],
        },
        '/posts': {
          filePath: '/routes/posts.tsx',
          children: ['/posts/$postId'],
          preloads: ['/assets/posts.js'],
          assets: [
            {
              tag: 'script' as const,
              attrs: {
                src: '/assets/posts.js',
                type: 'module',
              },
              children: 'console.log("posts")',
            },
          ],
        },
      },
      clientEntry: '/assets/entry.js',
    }

    expect(
      deserializeSerializedManifest(serializeStartManifest(manifest)),
    ).toEqual(manifest)
  })

  test('serializeStartManifest handles manifests without route assets', () => {
    const manifest: StartManifest = {
      routes: {
        __root__: {
          children: ['/posts'],
          preloads: ['/assets/root.js'],
        },
        '/posts': {
          filePath: '/routes/posts.tsx',
          preloads: ['/assets/posts.js'],
        },
      },
      clientEntry: '/assets/entry.js',
    }

    expect(
      deserializeSerializedManifest(serializeStartManifest(manifest)),
    ).toEqual(manifest)
  })
})

describe('route tree dedupe in buildStartManifest', () => {
  test('dedupes assets and preloads only along the active ancestor path', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      imports: ['root-shared.js'],
      importedCss: ['root.css'],
    })
    const rootSharedChunk = makeChunk({
      fileName: 'root-shared.js',
      importedCss: ['shared.css'],
    })
    const parentChunk = makeChunk({
      fileName: 'parent.js',
      imports: ['root-shared.js', 'parent-only.js'],
      moduleIds: ['/routes/parent.tsx?tsr-split=component'],
    })
    const parentOnlyChunk = makeChunk({
      fileName: 'parent-only.js',
      importedCss: ['parent.css'],
    })
    const childChunk = makeChunk({
      fileName: 'child.js',
      imports: ['root-shared.js', 'parent-only.js', 'child-only.js'],
      moduleIds: ['/routes/child.tsx?tsr-split=component'],
    })
    const childOnlyChunk = makeChunk({
      fileName: 'child-only.js',
      importedCss: ['child.css'],
    })
    const siblingChunk = makeChunk({
      fileName: 'sibling.js',
      imports: ['root-shared.js', 'sibling-only.js'],
      moduleIds: ['/routes/sibling.tsx?tsr-split=component'],
    })
    const siblingOnlyChunk = makeChunk({
      fileName: 'sibling-only.js',
      importedCss: ['sibling.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'root-shared.js': rootSharedChunk,
        'parent.js': parentChunk,
        'parent-only.js': parentOnlyChunk,
        'child.js': childChunk,
        'child-only.js': childOnlyChunk,
        'sibling.js': siblingChunk,
        'sibling-only.js': siblingOnlyChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/parent', '/sibling'] } as any,
        '/parent': { filePath: '/routes/parent.tsx', children: ['/child'] },
        '/child': { filePath: '/routes/child.tsx' },
        '/sibling': { filePath: '/routes/sibling.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/root.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/shared.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes.__root__!.preloads).toEqual([
      '/assets/entry.js',
      '/assets/root-shared.js',
    ])
    expect(manifest.routes['/parent']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/parent.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/parent']!.preloads).toEqual([
      '/assets/parent.js',
      '/assets/parent-only.js',
    ])
    expect(manifest.routes['/child']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/child.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/child']!.preloads).toEqual([
      '/assets/child.js',
      '/assets/child-only.js',
    ])
    expect(manifest.routes['/sibling']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/sibling.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/sibling']!.preloads).toEqual([
      '/assets/sibling.js',
      '/assets/sibling-only.js',
    ])
  })

  test('backtracking preserves reused assets and preloads for cousin routes', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
    })
    const deepChunk = makeChunk({
      fileName: 'deep.js',
      importedCss: ['deep.css'],
    })
    const aChunk = makeChunk({
      fileName: 'a.js',
      moduleIds: ['/routes/a.tsx?tsr-split=component'],
    })
    const aChildChunk = makeChunk({
      fileName: 'a-child.js',
      imports: ['deep.js'],
      moduleIds: ['/routes/a-child.tsx?tsr-split=component'],
    })
    const bChunk = makeChunk({
      fileName: 'b.js',
      moduleIds: ['/routes/b.tsx?tsr-split=component'],
    })
    const bChildChunk = makeChunk({
      fileName: 'b-child.js',
      imports: ['deep.js', 'b-child-only.js'],
      moduleIds: ['/routes/b-child.tsx?tsr-split=component'],
    })
    const bChildOnlyChunk = makeChunk({
      fileName: 'b-child-only.js',
      importedCss: ['b-child.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'deep.js': deepChunk,
        'a.js': aChunk,
        'a-child.js': aChildChunk,
        'b.js': bChunk,
        'b-child.js': bChildChunk,
        'b-child-only.js': bChildOnlyChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/a', '/b'] } as any,
        '/a': { filePath: '/routes/a.tsx', children: ['/a-child'] },
        '/a-child': { filePath: '/routes/a-child.tsx' },
        '/b': { filePath: '/routes/b.tsx', children: ['/b-child'] },
        '/b-child': { filePath: '/routes/b-child.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/a-child']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/deep.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/a-child']!.preloads).toEqual([
      '/assets/a-child.js',
      '/assets/deep.js',
    ])
    expect(manifest.routes['/b-child']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/deep.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/b-child.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/b-child']!.preloads).toEqual([
      '/assets/b-child.js',
      '/assets/deep.js',
      '/assets/b-child-only.js',
    ])
  })

  test('dedupes reused assets and preloads across a deeply nested ancestor chain', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      imports: ['shared-root.js'],
      importedCss: ['root.css'],
    })
    const sharedRootChunk = makeChunk({
      fileName: 'shared-root.js',
      importedCss: ['shared-root.css'],
    })
    const levelOneChunk = makeChunk({
      fileName: 'level-one.js',
      imports: ['shared-root.js', 'level-one-only.js'],
      moduleIds: ['/routes/level-one.tsx?tsr-split=component'],
    })
    const levelOneOnlyChunk = makeChunk({
      fileName: 'level-one-only.js',
      importedCss: ['level-one.css'],
    })
    const levelTwoChunk = makeChunk({
      fileName: 'level-two.js',
      imports: ['shared-root.js', 'level-one-only.js', 'level-two-only.js'],
      moduleIds: ['/routes/level-two.tsx?tsr-split=component'],
    })
    const levelTwoOnlyChunk = makeChunk({
      fileName: 'level-two-only.js',
      importedCss: ['level-two.css'],
    })
    const levelThreeChunk = makeChunk({
      fileName: 'level-three.js',
      imports: [
        'shared-root.js',
        'level-one-only.js',
        'level-two-only.js',
        'level-three-only.js',
      ],
      moduleIds: ['/routes/level-three.tsx?tsr-split=component'],
    })
    const levelThreeOnlyChunk = makeChunk({
      fileName: 'level-three-only.js',
      importedCss: ['level-three.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'shared-root.js': sharedRootChunk,
        'level-one.js': levelOneChunk,
        'level-one-only.js': levelOneOnlyChunk,
        'level-two.js': levelTwoChunk,
        'level-two-only.js': levelTwoOnlyChunk,
        'level-three.js': levelThreeChunk,
        'level-three-only.js': levelThreeOnlyChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/level-one'] } as any,
        '/level-one': {
          filePath: '/routes/level-one.tsx',
          children: ['/level-two'],
        },
        '/level-two': {
          filePath: '/routes/level-two.tsx',
          children: ['/level-three'],
        },
        '/level-three': { filePath: '/routes/level-three.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/root.css',
          type: 'text/css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/shared-root.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes.__root__!.preloads).toEqual([
      '/assets/entry.js',
      '/assets/shared-root.js',
    ])
    expect(manifest.routes['/level-one']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/level-one.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/level-one']!.preloads).toEqual([
      '/assets/level-one.js',
      '/assets/level-one-only.js',
    ])
    expect(manifest.routes['/level-two']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/level-two.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/level-two']!.preloads).toEqual([
      '/assets/level-two.js',
      '/assets/level-two-only.js',
    ])
    expect(manifest.routes['/level-three']!.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/level-three.css',
          type: 'text/css',
        },
      },
    ])
    expect(manifest.routes['/level-three']!.preloads).toEqual([
      '/assets/level-three.js',
      '/assets/level-three-only.js',
    ])
  })

  test('throws when non-root route has no filePath', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
    })

    expect(() =>
      buildStartManifest({
        clientBuild: normalizeViteClientBuild({ 'entry.js': entryChunk }),
        routeTreeRoutes: {
          __root__: { filePath: '/routes/__root.tsx', children: ['/about'] },
          '/about': {} as any,
        },
        basePath: '/assets',
      }),
    ).toThrow('expected filePath to be set for /about')
  })

  test('throws a descriptive error when a child route is missing from the tree', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      importedCss: ['entry.css'],
    })

    expect(() =>
      buildStartManifest({
        clientBuild: normalizeViteClientBuild({ 'entry.js': entryChunk }),
        routeTreeRoutes: {
          __root__: { children: ['/about'] } as any,
        },
        basePath: '/assets',
      }),
    ).toThrow(
      'Route tree references child route /about from __root__, but no route entry was found',
    )
  })
})

describe('multi-chunk routes must merge assets and preloads', () => {
  test('route with component and loader chunks includes assets from both', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      importedCss: ['entry.css'],
    })
    // Two separate chunks for the same route file (component + loader splits)
    const componentChunk = makeChunk({
      fileName: 'posts-component.js',
      imports: ['component-styles.js'],
      moduleIds: ['/routes/posts.tsx?tsr-split=component'],
    })
    const loaderChunk = makeChunk({
      fileName: 'posts-loader.js',
      imports: ['loader-dep.js'],
      moduleIds: ['/routes/posts.tsx?tsr-split=loader'],
    })
    const componentStylesChunk = makeChunk({
      fileName: 'component-styles.js',
      importedCss: ['component.css'],
    })
    const loaderDepChunk = makeChunk({
      fileName: 'loader-dep.js',
      importedCss: ['loader.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'posts-component.js': componentChunk,
        'posts-loader.js': loaderChunk,
        'component-styles.js': componentStylesChunk,
        'loader-dep.js': loaderDepChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/posts'] } as any,
        '/posts': { filePath: '/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    const postsRoute = manifest.routes['/posts']!

    // Both chunks' CSS should be present
    const cssHrefs = postsRoute.assets!.map((a: any) => a.attrs.href)
    expect(cssHrefs).toContain('/assets/component.css')
    expect(cssHrefs).toContain('/assets/loader.css')

    // Both chunks' preloads should be present
    expect(postsRoute.preloads).toContain('/assets/posts-component.js')
    expect(postsRoute.preloads).toContain('/assets/posts-loader.js')
    expect(postsRoute.preloads).toContain('/assets/component-styles.js')
    expect(postsRoute.preloads).toContain('/assets/loader-dep.js')
  })

  test('route with overlapping chunk dependencies dedupes merged assets and preloads', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      importedCss: ['entry.css'],
    })
    const sharedDep = makeChunk({
      fileName: 'shared-dep.js',
      importedCss: ['shared.css'],
    })
    const componentChunk = makeChunk({
      fileName: 'posts-component.js',
      imports: ['shared-dep.js'],
      moduleIds: ['/routes/posts.tsx?tsr-split=component'],
    })
    const loaderChunk = makeChunk({
      fileName: 'posts-loader.js',
      imports: ['shared-dep.js'],
      moduleIds: ['/routes/posts.tsx?tsr-split=loader'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'shared-dep.js': sharedDep,
        'posts-component.js': componentChunk,
        'posts-loader.js': loaderChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/posts'] } as any,
        '/posts': { filePath: '/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    const postsRoute = manifest.routes['/posts']!
    const cssHrefs = postsRoute.assets!.map((a: any) => a.attrs.href)
    const preloadHrefs = postsRoute.preloads!

    expect(
      cssHrefs.filter((href: string) => href === '/assets/shared.css'),
    ).toHaveLength(1)
    expect(
      preloadHrefs.filter((href: string) => href === '/assets/shared-dep.js'),
    ).toHaveLength(1)
  })
})

describe('entry chunk dynamic imports must be scanned for dynamic CSS', () => {
  test('CSS behind entry chunk dynamic import gets # suffix', () => {
    // Entry chunk dynamically imports a chunk with CSS,
    // but no route entry chunk references that dynamic import
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      dynamicImports: ['global-lazy.js'],
      importedCss: ['entry.css'],
    })
    const globalLazyChunk = makeChunk({
      fileName: 'global-lazy.js',
      importedCss: ['global-lazy.css'],
    })
    // A route that statically imports the same CSS chunk
    const routeChunk = makeChunk({
      fileName: 'route.js',
      imports: ['global-lazy.js'],
      moduleIds: ['/routes/home.tsx?tsr-split=component'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
        'global-lazy.js': globalLazyChunk,
        'route.js': routeChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/home'] } as any,
        '/home': { filePath: '/routes/home.tsx' },
      },
      basePath: '/assets',
    })

    // global-lazy.css is reachable through both the router-managed route
    // and the entry chunk's non-route dynamic import, so it should have #
    const homeAssets = manifest.routes['/home']!.assets!
    const globalLazyCss = homeAssets.find((a: any) =>
      a.attrs.href.includes('global-lazy.css'),
    ) as any
    expect(globalLazyCss).toBeDefined()
    expect(globalLazyCss.attrs.href).toBe('/assets/global-lazy.css#')
  })
})

describe('buildStartManifest route pruning', () => {
  test('routes with no assets or preloads are pruned from returned manifest', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
      importedCss: ['entry.css'],
    })

    const manifest = buildStartManifest({
      clientBuild: normalizeViteClientBuild({
        'entry.js': entryChunk,
      }),
      routeTreeRoutes: {
        __root__: { children: ['/about'] } as any,
        '/about': { filePath: '/routes/about.tsx' },
      },
      basePath: '/assets',
    })

    // /about has no matching chunks, so no assets or preloads.
    // It should be pruned from the manifest.
    expect(manifest.routes['/about']).toBeUndefined()
  })
})
