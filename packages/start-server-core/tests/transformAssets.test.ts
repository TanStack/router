import { describe, expect, it, vi } from 'vitest'
import {
  adaptTransformAssetUrlsToTransformAssets,
  resolveTransformAssetsConfig,
  transformManifestAssets,
} from '../src/transformAssetUrls'

describe('transformAssets', () => {
  it('supports string shorthand', async () => {
    const config = resolveTransformAssetsConfig('https://cdn.example.com')

    expect(config.type).toBe('transform')
    if (config.type !== 'transform') {
      throw new Error('expected transform config')
    }

    expect(
      config.transformFn({ kind: 'modulepreload', url: '/assets/app.js' }),
    ).toEqual({ href: 'https://cdn.example.com/assets/app.js' })
  })

  it('supports object return values with crossOrigin', async () => {
    const manifest = await transformManifestAssets(
      {
        manifest: {
          routes: {
            __root__: {
              preloads: ['/assets/app.js'],
              assets: [
                {
                  tag: 'link',
                  attrs: { rel: 'stylesheet', href: '/assets/app.css' },
                },
              ],
            },
          },
        },
        clientEntry: '/assets/entry.js',
      },
      ({ kind, url }) => {
        if (kind === 'modulepreload') {
          return {
            href: `https://cdn.example.com${url}`,
            crossOrigin: 'anonymous',
          }
        }

        return { href: `https://cdn.example.com${url}` }
      },
      { clone: true },
    )

    expect(manifest.routes.__root__?.preloads).toEqual([
      {
        href: 'https://cdn.example.com/assets/app.js',
        crossOrigin: 'anonymous',
      },
    ])
    expect(manifest.routes.__root__?.assets?.[0]).toEqual({
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: 'https://cdn.example.com/assets/app.css',
      },
    })
  })

  it('adapts deprecated transformAssetUrls functions', async () => {
    const fn = vi.fn(({ url }: { url: string; type: string }) => `cdn:${url}`)
    const adapted = adaptTransformAssetUrlsToTransformAssets(fn)

    await expect(
      adapted({ kind: 'stylesheet', url: '/assets/app.css' }),
    ).resolves.toEqual({ href: 'cdn:/assets/app.css' })
    expect(fn).toHaveBeenCalledWith({
      type: 'stylesheet',
      url: '/assets/app.css',
    })
  })

  it('preserves string preload format when transform returns no crossOrigin', async () => {
    const manifest = await transformManifestAssets(
      {
        manifest: {
          routes: {
            __root__: {
              preloads: ['/assets/app.js'],
              assets: [],
            },
          },
        },
        clientEntry: '/assets/entry.js',
      },
      ({ url }) => ({ href: `https://cdn.example.com${url}` }),
      { clone: true },
    )

    // When original was a string and no crossOrigin is added, should remain a string
    expect(manifest.routes.__root__?.preloads?.[0]).toBe(
      'https://cdn.example.com/assets/app.js',
    )
  })

  it('does not mutate the source manifest when clone is false', async () => {
    const source = {
      manifest: {
        routes: {
          __root__: {
            preloads: ['/assets/app.js'],
            assets: [
              {
                tag: 'link' as const,
                attrs: { rel: 'stylesheet', href: '/assets/app.css' },
              },
            ],
          },
        },
      },
      clientEntry: '/assets/entry.js',
    }

    const manifest = await transformManifestAssets(
      source,
      ({ url }) => ({ href: `https://cdn.example.com${url}` }),
      { clone: false },
    )

    expect(manifest.routes.__root__?.preloads?.[0]).toBe(
      'https://cdn.example.com/assets/app.js',
    )
    expect(source.manifest.routes.__root__?.preloads?.[0]).toBe(
      '/assets/app.js',
    )
    expect(source.manifest.routes.__root__?.assets?.[0]).toEqual({
      tag: 'link',
      attrs: { rel: 'stylesheet', href: '/assets/app.css' },
    })
  })

  it('only treats stylesheet links in route.assets as stylesheet transforms', async () => {
    const transformFn = vi.fn(({ url }) => ({
      href: `https://cdn.example.com${url}`,
    }))

    const manifest = await transformManifestAssets(
      {
        manifest: {
          routes: {
            __root__: {
              preloads: [],
              assets: [
                {
                  tag: 'link',
                  attrs: { rel: 'stylesheet preload', href: '/assets/app.css' },
                },
                {
                  tag: 'link',
                  attrs: { rel: 'icon', href: '/favicon.ico' },
                },
              ],
            },
          },
        },
        clientEntry: '/assets/entry.js',
      },
      transformFn,
      { clone: true },
    )

    expect(transformFn).toHaveBeenCalledWith({
      kind: 'stylesheet',
      url: '/assets/app.css',
    })
    expect(transformFn).not.toHaveBeenCalledWith({
      kind: 'stylesheet',
      url: '/favicon.ico',
    })
    expect(manifest.routes.__root__?.assets).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet preload',
          href: 'https://cdn.example.com/assets/app.css',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'icon',
          href: '/favicon.ico',
        },
      },
      {
        tag: 'script',
        attrs: {
          type: 'module',
          async: true,
        },
        children: 'import("https://cdn.example.com/assets/entry.js")',
      },
    ])
  })

  describe('object shorthand', () => {
    it('supports { prefix } — same as string shorthand', () => {
      const config = resolveTransformAssetsConfig({
        prefix: 'https://cdn.example.com',
      })

      expect(config.type).toBe('transform')
      expect(config.cache).toBe(true)
      if (config.type !== 'transform') throw new Error('expected transform')

      expect(
        config.transformFn({ kind: 'modulepreload', url: '/assets/app.js' }),
      ).toEqual({ href: 'https://cdn.example.com/assets/app.js' })
    })

    it('supports { prefix, crossOrigin: string } — uniform crossOrigin', () => {
      const config = resolveTransformAssetsConfig({
        prefix: 'https://cdn.example.com',
        crossOrigin: 'anonymous',
      })

      if (config.type !== 'transform') throw new Error('expected transform')

      expect(
        config.transformFn({ kind: 'modulepreload', url: '/assets/app.js' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/app.js',
        crossOrigin: 'anonymous',
      })

      expect(
        config.transformFn({ kind: 'stylesheet', url: '/assets/app.css' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/app.css',
        crossOrigin: 'anonymous',
      })

      expect(
        config.transformFn({ kind: 'clientEntry', url: '/assets/entry.js' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/entry.js',
      })
    })

    it('supports { prefix, crossOrigin: per-kind } — different crossOrigin per kind', () => {
      const config = resolveTransformAssetsConfig({
        prefix: 'https://cdn.example.com',
        crossOrigin: {
          modulepreload: 'anonymous',
          stylesheet: 'use-credentials',
        },
      })

      if (config.type !== 'transform') throw new Error('expected transform')

      expect(
        config.transformFn({ kind: 'modulepreload', url: '/assets/app.js' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/app.js',
        crossOrigin: 'anonymous',
      })

      expect(
        config.transformFn({ kind: 'stylesheet', url: '/assets/app.css' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/app.css',
        crossOrigin: 'use-credentials',
      })

      // clientEntry not specified in the per-kind record — no crossOrigin
      expect(
        config.transformFn({ kind: 'clientEntry', url: '/assets/entry.js' }),
      ).toEqual({
        href: 'https://cdn.example.com/assets/entry.js',
      })
    })

    it('supports empty-string prefix shorthand', () => {
      const config = resolveTransformAssetsConfig('')

      if (config.type !== 'transform') throw new Error('expected transform')

      expect(
        config.transformFn({ kind: 'modulepreload', url: '/assets/app.js' }),
      ).toEqual({ href: '/assets/app.js' })
    })

    it('applies object shorthand crossOrigin to manifest assets', async () => {
      const config = resolveTransformAssetsConfig({
        prefix: 'https://cdn.example.com',
        crossOrigin: {
          modulepreload: 'anonymous',
        },
      })

      if (config.type !== 'transform') throw new Error('expected transform')

      const manifest = await transformManifestAssets(
        {
          manifest: {
            routes: {
              __root__: {
                preloads: ['/assets/app.js'],
                assets: [
                  {
                    tag: 'link',
                    attrs: { rel: 'stylesheet', href: '/assets/app.css' },
                  },
                ],
              },
            },
          },
          clientEntry: '/assets/entry.js',
        },
        config.transformFn,
        { clone: true },
      )

      expect(manifest.routes.__root__?.preloads).toEqual([
        {
          href: 'https://cdn.example.com/assets/app.js',
          crossOrigin: 'anonymous',
        },
      ])

      // Stylesheet has no crossOrigin in the per-kind config
      expect(manifest.routes.__root__?.assets?.[0]).toEqual({
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: 'https://cdn.example.com/assets/app.css',
        },
      })
    })
  })
})
