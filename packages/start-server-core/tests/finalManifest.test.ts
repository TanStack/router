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
  it('reuses a resolved base manifest without sharing a pending load', async () => {
    const loadBaseManifest = vi.fn(async () => baseManifest)
    const getBaseManifest = createCachedBaseManifestLoader(loadBaseManifest)

    await expect(getBaseManifest()).resolves.toBe(baseManifest)
    await expect(getBaseManifest()).resolves.toBe(baseManifest)
    expect(loadBaseManifest).toHaveBeenCalledTimes(1)
  })

  it('does not let a pending base manifest load block a later request', async () => {
    let resolveFirst!: (manifest: ServerManifest) => void
    const loadBaseManifest = vi
      .fn<() => Promise<ServerManifest>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(baseManifest)
    const getBaseManifest = createCachedBaseManifestLoader(loadBaseManifest)

    const first = getBaseManifest()
    const second = getBaseManifest()

    await expect(second).resolves.toBe(baseManifest)
    expect(loadBaseManifest).toHaveBeenCalledTimes(2)

    resolveFirst(baseManifest)
    await expect(first).resolves.toBe(baseManifest)
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

  it('shares a settled warmup manifest with later request resolution', async () => {
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

    const warmupManifest = await resolver.warmup({ getBaseManifest })
    const requestManifest = resolver.resolveCached({
      request: new Request('https://example.com'),
      requestInlineCss: undefined,
      getBaseManifest,
    })

    expect(requestManifest).toBe(warmupManifest)
    expect(warmupManifest?.inlineCss).toBeUndefined()
    expect(transformAssets).toHaveBeenCalledTimes(1)
  })

  it('does not let a pending final manifest load block a later request', async () => {
    let resolveFirst!: (manifest: ServerManifest) => void
    const getBaseManifest = vi
      .fn<() => Promise<ServerManifest>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(baseManifest)
    const resolver = createFinalManifestResolver({ cacheCreateTransform: true })
    const request = new Request('https://example.com')

    const first = resolver.resolveCached({
      request,
      requestInlineCss: true,
      getBaseManifest,
    })
    const second = resolver.resolveCached({
      request,
      requestInlineCss: true,
      getBaseManifest,
    })

    await expect(second).resolves.toMatchObject({
      inlineCss: baseManifest.inlineCss,
    })
    expect(getBaseManifest).toHaveBeenCalledTimes(2)

    resolveFirst(baseManifest)
    await expect(first).resolves.toMatchObject({
      inlineCss: baseManifest.inlineCss,
    })
  })

  it('returns a settled cached manifest without a promise', async () => {
    const getBaseManifest = vi.fn(async () => baseManifest)
    const resolver = createFinalManifestResolver({ cacheCreateTransform: true })
    const request = new Request('http://localhost/')

    const first = await resolver.resolveCached({
      request,
      requestInlineCss: undefined,
      getBaseManifest,
    })
    const second = resolver.resolveCached({
      request,
      requestInlineCss: undefined,
      getBaseManifest,
    })

    expect(second).toBe(first)
    expect(getBaseManifest).toHaveBeenCalledTimes(1)
  })

  it('resolves each request when inline CSS is decided per request', async () => {
    const getBaseManifest = vi.fn(async () => baseManifest)
    const inlineCss = vi.fn(() => false)
    const resolver = createFinalManifestResolver({
      cacheCreateTransform: true,
      inlineCss,
    })
    const request = new Request('http://localhost/')

    const first = await resolver.resolveCached({
      request,
      requestInlineCss: undefined,
      getBaseManifest,
    })
    const second = resolver.resolveCached({
      request,
      requestInlineCss: undefined,
      getBaseManifest,
    })

    expect(second).toBeInstanceOf(Promise)
    await expect(second).resolves.toBe(first)
    expect(inlineCss).toHaveBeenCalledTimes(2)
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
