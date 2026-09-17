import { describe, expect, it, vi } from 'vitest'
import {
  createCachedBaseManifestLoader,
  createFinalManifestResolver,
} from '../src/finalManifest'
import type { ServerManifest } from '@tanstack/router-core'
import type { TransformAssetsFn } from '../src/transformAssetUrls'

const baseManifest: ServerManifest = {
  inlineCss: {
    styles: {
      '/assets/app.css': '.app{color:red}',
    },
  },
  routes: {
    __root__: {
      preloads: ['/assets/entry.js'],
      scripts: [
        {
          attrs: {
            type: 'module',
            async: true,
            src: '/assets/entry.js',
          },
        },
      ],
    },
  },
}

describe('final manifest resolver', () => {
  it('shares cached base manifest load promises', async () => {
    const loadBaseManifest = vi.fn(async () => baseManifest)
    const getBaseManifest = createCachedBaseManifestLoader(loadBaseManifest)

    const first = getBaseManifest()
    const second = getBaseManifest()

    expect(second).toBe(first)
    await expect(first).resolves.toBe(baseManifest)
    expect(loadBaseManifest).toHaveBeenCalledTimes(1)
  })

  it('evicts rejected cached base manifest promises so requests can retry', async () => {
    const loadBaseManifest = vi
      .fn<() => Promise<ServerManifest>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(baseManifest)
    const getBaseManifest = createCachedBaseManifestLoader(loadBaseManifest)

    await expect(getBaseManifest()).rejects.toThrow('transient')
    await expect(getBaseManifest()).resolves.toBe(baseManifest)
    expect(loadBaseManifest).toHaveBeenCalledTimes(2)
  })

  it('caches inline and linked final manifests independently', async () => {
    const getBaseManifest = vi.fn(async () => baseManifest)
    const transformAssets: TransformAssetsFn = ({ url }) => url
    const resolver = createFinalManifestResolver({
      transformAssets,
      cacheCreateTransform: true,
    })
    const request = new Request('https://example.com')

    const inline = await resolver.resolveCached({
      request,
      requestInlineCss: true,
      getBaseManifest,
    })
    const inlineAgain = await resolver.resolveCached({
      request,
      requestInlineCss: true,
      getBaseManifest,
    })
    const linked = await resolver.resolveCached({
      request,
      requestInlineCss: false,
      getBaseManifest,
    })

    expect(inlineAgain).toBe(inline)
    expect(linked).not.toBe(inline)
    expect(inline.inlineCss).toBeDefined()
    expect(linked.inlineCss).toBeUndefined()
    expect(getBaseManifest).toHaveBeenCalledTimes(2)
  })

  it.each([undefined, true, false])(
    'shares cached promises without transforms for inlineCss=%s',
    async (inlineCss) => {
      const getBaseManifest = vi.fn(async () => baseManifest)
      const resolver = createFinalManifestResolver({
        inlineCss,
        cacheCreateTransform: true,
      })
      const requestOpts = {
        request: new Request('https://example.com'),
        requestInlineCss: undefined,
        getBaseManifest,
      }
      const defaultManifest = await resolver.resolveCached(requestOpts)
      const cachedDefault = resolver.resolveCached(requestOpts)

      expect(resolver.resolveCached(requestOpts)).toBe(cachedDefault)
      await expect(cachedDefault).resolves.toBe(defaultManifest)
      expect(!!defaultManifest.inlineCss).toBe(inlineCss ?? true)

      const overrideOpts = {
        ...requestOpts,
        requestInlineCss: !(inlineCss ?? true),
      }
      const overrideManifest = await resolver.resolveCached(overrideOpts)
      const cachedOverride = resolver.resolveCached(overrideOpts)

      expect(resolver.resolveCached(overrideOpts)).toBe(cachedOverride)
      await expect(cachedOverride).resolves.toBe(overrideManifest)
      expect(!!overrideManifest.inlineCss).toBe(overrideOpts.requestInlineCss)
      expect(cachedOverride).not.toBe(cachedDefault)
      expect(getBaseManifest).toHaveBeenCalledTimes(2)
    },
  )

  it('loads current assets for uncached requests without transforms', async () => {
    const getBaseManifest = vi.fn(async () => baseManifest)
    const resolver = createFinalManifestResolver({
      cacheCreateTransform: false,
    })
    const requestOpts = {
      request: new Request('https://example.com'),
      requestInlineCss: undefined,
      getBaseManifest,
    }
    const cached = await resolver.resolveCached(requestOpts)
    getBaseManifest.mockResolvedValue({
      ...baseManifest,
      inlineCss: { styles: { '/assets/app.css': '.app{color:blue}' } },
    })

    const uncached = await resolver.resolveUncached(requestOpts)

    expect(uncached.inlineCss?.styles['/assets/app.css']).toBe(
      '.app{color:blue}',
    )
    expect(cached.inlineCss?.styles['/assets/app.css']).toBe('.app{color:red}')
    expect(getBaseManifest).toHaveBeenCalledTimes(2)
  })

  it('evaluates request-dependent inline CSS without transforms unless overridden', async () => {
    const inlineCss = vi.fn(({ request }: { request: Request }) =>
      request.url.endsWith('/inline'),
    )
    const resolver = createFinalManifestResolver({
      inlineCss,
      cacheCreateTransform: true,
    })
    const getBaseManifest = vi.fn(async () => baseManifest)

    const inline = await resolver.resolveCached({
      request: new Request('https://example.com/inline'),
      requestInlineCss: undefined,
      getBaseManifest,
    })
    const linked = await resolver.resolveCached({
      request: new Request('https://example.com/linked'),
      requestInlineCss: undefined,
      getBaseManifest,
    })
    const overridden = await resolver.resolveCached({
      request: new Request('https://example.com/linked'),
      requestInlineCss: true,
      getBaseManifest,
    })

    expect(inline.inlineCss).toBeDefined()
    expect(linked.inlineCss).toBeUndefined()
    expect(overridden).toBe(inline)
    expect(inlineCss).toHaveBeenCalledTimes(2)
    expect(getBaseManifest).toHaveBeenCalledTimes(2)
  })

  it('evicts rejected cached final manifest promises so requests can retry', async () => {
    const getBaseManifest = vi
      .fn<() => Promise<ServerManifest>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(baseManifest)
    const resolver = createFinalManifestResolver({ cacheCreateTransform: true })
    const request = new Request('https://example.com')

    await expect(
      resolver.resolveCached({
        request,
        requestInlineCss: true,
        getBaseManifest,
      }),
    ).rejects.toThrow('transient')

    await expect(
      resolver.resolveCached({
        request,
        requestInlineCss: true,
        getBaseManifest,
      }),
    ).resolves.toMatchObject({ inlineCss: baseManifest.inlineCss })
    expect(getBaseManifest).toHaveBeenCalledTimes(2)
  })

  it('shares warmup and request resolution for the same cached manifest', async () => {
    const transformAssets = vi.fn<TransformAssetsFn>(({ url }) => url)
    const getBaseManifest = vi.fn(async () => baseManifest)
    const resolver = createFinalManifestResolver({
      inlineCss: false,
      transformAssets: {
        transform: transformAssets,
        warmup: true,
      },
      cacheCreateTransform: true,
    })

    const warmupPromise = resolver.warmup({ getBaseManifest })
    const requestManifest = await resolver.resolveCached({
      request: new Request('https://example.com'),
      requestInlineCss: undefined,
      getBaseManifest,
    })

    await expect(warmupPromise).resolves.toBe(requestManifest)
    expect(requestManifest.inlineCss).toBeUndefined()
    expect(transformAssets).toHaveBeenCalledTimes(1)
  })

  it('does not warm up when the inline CSS default is request-dependent', () => {
    const getBaseManifest = vi.fn(async () => baseManifest)
    const transformAssets: TransformAssetsFn = ({ url }) => url
    const resolver = createFinalManifestResolver({
      inlineCss: () => true,
      transformAssets: {
        transform: transformAssets,
        warmup: true,
      },
      cacheCreateTransform: true,
    })

    expect(resolver.warmup({ getBaseManifest })).toBeUndefined()
    expect(getBaseManifest).not.toHaveBeenCalled()
  })

  it('resolves request inline CSS overrides and transform assets together', async () => {
    const resolver = createFinalManifestResolver({
      inlineCss: false,
      transformAssets: 'https://cdn.example.com',
      cacheCreateTransform: true,
    })

    const manifest = await resolver.resolveCached({
      request: new Request('https://example.com'),
      requestInlineCss: true,
      getBaseManifest: async () => baseManifest,
    })

    expect(manifest.inlineCss).toBeDefined()
    expect(manifest.routes.__root__?.scripts?.at(-1)).toMatchObject({
      attrs: {
        type: 'module',
        async: true,
        src: 'https://cdn.example.com/assets/entry.js',
      },
    })
  })
})
