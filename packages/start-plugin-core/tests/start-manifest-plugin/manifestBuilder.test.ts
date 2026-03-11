import { describe, expect, test } from 'vitest'
import {
  appendUniqueAssets,
  appendUniqueStrings,
  buildStartManifest,
  collectDynamicImportCss,
  createChunkCssAssetCollector,
  createManifestAssetResolvers,
  dedupeNestedRoutePreloads,
  getRouteFilePathsFromModuleIds,
  scanClientChunks,
} from '../../src/start-manifest-plugin/manifestBuilder'
import type { Manifest } from '@tanstack/router-core'
import type { Rollup } from 'vite'

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

    const scanned = scanClientChunks({
      'entry.js': entryChunk,
      'posts.js': routeChunk,
    })

    expect(scanned.entryChunk).toBe(entryChunk)
    expect(scanned.routeEntryChunks.has(routeChunk)).toBe(true)
    expect(scanned.routeChunksByFilePath.get('/routes/posts.tsx')).toEqual([
      routeChunk,
    ])
  })

  test('throws when no entry chunk exists', () => {
    const routeChunk = makeChunk({
      fileName: 'posts.js',
      moduleIds: ['/routes/posts.tsx?tsr-split=component'],
    })

    expect(() => scanClientChunks({ 'posts.js': routeChunk })).toThrow(
      'No entry file found',
    )
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
      new Set([routeChunk]),
      new Map([
        ['route.js', routeChunk],
        ['lazy.js', lazyChunk],
        ['shared.js', sharedChunk],
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
      new Set([routeA, routeB]),
      new Map([
        ['routeA.js', routeA],
        ['routeB.js', routeB],
        ['shared.js', sharedChunk],
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

    const dynamicCss = collectDynamicImportCss(
      new Set([routeChunk]),
      new Map([
        ['entry.js', entryChunk],
        ['route.js', routeChunk],
        ['lazy.js', lazyChunk],
        ['shared.js', sharedChunk],
      ]),
      entryChunk,
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
      ['entry.js', entryChunk],
      ['shared.js', sharedChunk],
    ])

    const resolvers = createManifestAssetResolvers({
      basePath: '/assets',
      hashedCssFiles: new Set(['shared.css']),
    })
    const cssAssetCollector = createChunkCssAssetCollector({
      chunksByFileName,
      getStylesheetAsset: resolvers.getStylesheetAsset,
    })

    const assets = cssAssetCollector.getChunkCssAssets(entryChunk)

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
      ['a.js', chunkA],
      ['b.js', chunkB],
    ])

    const { getChunkCssAssets } = createChunkCssAssetCollector({
      chunksByFileName,
      getStylesheetAsset: (cssFile) => ({
        tag: 'link',
        attrs: { rel: 'stylesheet', href: `/${cssFile}`, type: 'text/css' },
      }),
    })

    const assets = getChunkCssAssets(chunkA)
    const hrefs = assets.map((a: any) => a.attrs.href)

    expect(hrefs).toContain('/a.css')
    expect(hrefs).toContain('/b.css')
    // No infinite recursion — test completes
  })
})

describe('buildStartManifest', () => {
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
      clientBundle: {
        'entry.js': entryChunk,
        'route-static.js': routeStaticChunk,
        'route-lazy.js': routeLazyChunk,
        'widget.js': widgetChunk,
        'widget-lazy.js': widgetLazyChunk,
      },
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

  test('keeps entry-owned css unsuffixed when shared only with route chunks', () => {
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
      clientBundle: {
        'entry.js': entryChunk,
        'shared.js': sharedChunk,
        'about.js': aboutChunk,
      },
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
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: '/assets/main.css',
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
      clientBundle: {
        'entry.js': entryChunk,
        'route.js': routeChunk,
        'shared.js': sharedChunk,
        'global-lazy.js': globalLazyChunk,
      },
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
})

describe('dedupeNestedRoutePreloads', () => {
  test('dedupes only along the active ancestor path', () => {
    const routes: Manifest['routes'] = {
      __root__: {
        children: ['a', 'b'],
        preloads: ['/root.js', '/shared.js'],
      } as any,
      a: {
        preloads: ['/shared.js', '/a.js'],
      },
      b: {
        preloads: ['/shared.js', '/b.js'],
      },
    }

    dedupeNestedRoutePreloads(routes.__root__!, routes)

    expect(routes.__root__!.preloads).toEqual(['/root.js', '/shared.js'])
    expect(routes.a!.preloads).toEqual(['/a.js'])
    expect(routes.b!.preloads).toEqual(['/b.js'])
  })

  test('dedupes correctly with 3+ levels of nesting', () => {
    const routes: Manifest['routes'] = {
      __root__: {
        children: ['parent'],
        preloads: ['/root.js', '/shared.js'],
      } as any,
      parent: {
        children: ['child'],
        preloads: ['/shared.js', '/parent.js'],
      } as any,
      child: {
        preloads: ['/shared.js', '/parent.js', '/child.js'],
      },
    }

    dedupeNestedRoutePreloads(routes.__root__!, routes)

    expect(routes.__root__!.preloads).toEqual(['/root.js', '/shared.js'])
    expect(routes.parent!.preloads).toEqual(['/parent.js'])
    expect(routes.child!.preloads).toEqual(['/child.js'])
  })

  test('backtracking works across sibling subtrees at depth 3+', () => {
    const routes: Manifest['routes'] = {
      __root__: {
        children: ['a', 'b'],
        preloads: ['/root.js'],
      } as any,
      a: {
        children: ['a-child'],
        preloads: ['/a.js'],
      } as any,
      'a-child': {
        preloads: ['/deep.js'],
      },
      b: {
        children: ['b-child'],
        preloads: ['/b.js'],
      } as any,
      'b-child': {
        // deep.js should NOT be deduped: it's a cousin, not an ancestor
        preloads: ['/deep.js', '/b-child.js'],
      },
    }

    dedupeNestedRoutePreloads(routes.__root__!, routes)

    expect(routes['a-child']!.preloads).toEqual(['/deep.js'])
    expect(routes['b-child']!.preloads).toEqual(['/deep.js', '/b-child.js'])
  })

  test('throws when non-root route has no filePath', () => {
    const entryChunk = makeChunk({
      fileName: 'entry.js',
      isEntry: true,
    })

    expect(() =>
      buildStartManifest({
        clientBundle: { 'entry.js': entryChunk },
        routeTreeRoutes: {
          __root__: { filePath: '/routes/__root.tsx', children: ['/about'] },
          '/about': {} as any,
        },
        basePath: '/assets',
      }),
    ).toThrow('expected filePath to be set for /about')
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
      clientBundle: {
        'entry.js': entryChunk,
        'posts-component.js': componentChunk,
        'posts-loader.js': loaderChunk,
        'component-styles.js': componentStylesChunk,
        'loader-dep.js': loaderDepChunk,
      },
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
      clientBundle: {
        'entry.js': entryChunk,
        'shared-dep.js': sharedDep,
        'posts-component.js': componentChunk,
        'posts-loader.js': loaderChunk,
      },
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
      clientBundle: {
        'entry.js': entryChunk,
        'global-lazy.js': globalLazyChunk,
        'route.js': routeChunk,
      },
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
      clientBundle: {
        'entry.js': entryChunk,
      },
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
