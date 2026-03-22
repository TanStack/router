import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import type { TransformAssetUrls } from '@tanstack/react-start/server'

type TransformAssetsFn = (ctx: {
  kind: 'modulepreload' | 'stylesheet' | 'clientEntry'
  url: string
}) =>
  | string
  | {
      href: string
      crossOrigin?: 'anonymous' | 'use-credentials'
    }

const cdnOrigin = process.env.CDN_ORIGIN
const transformMode = process.env.TRANSFORM_ASSETS_MODE || 'string'
const optionsKind =
  process.env.TRANSFORM_ASSETS_OPTIONS_KIND || 'createTransform'
const optionsCache = process.env.TRANSFORM_ASSETS_OPTIONS_CACHE || 'true'
const optionsWarmup = process.env.TRANSFORM_ASSETS_OPTIONS_WARMUP || 'true'
const useDeprecatedTransformAssetUrls =
  process.env.USE_DEPRECATED_TRANSFORM_ASSET_URLS === 'true'

const cache = optionsCache !== 'false'
const warmup = optionsWarmup === 'true'

console.log(
  `[server-entry]: using custom server entry with ${useDeprecatedTransformAssetUrls ? 'transformAssetUrls' : 'transformAssets'} (${transformMode}${transformMode === 'options' ? `:${optionsKind}` : ''})${cdnOrigin ? ` (CDN: ${cdnOrigin})` : ' (no CDN)'}`,
)

const createTransformAssetsFn =
  (cdn: string): TransformAssetsFn =>
  ({ kind, url }) => {
    const href = `${cdn}${url}`

    if (kind === 'modulepreload') {
      return {
        href,
        crossOrigin: 'anonymous',
      }
    }

    if (kind === 'stylesheet') {
      return {
        href,
        crossOrigin: 'anonymous',
      }
    }

    return { href }
  }

const createTransformAssetsConfig = (cdn: string) => {
  const transformAssetsFn = createTransformAssetsFn(cdn)

  if (transformMode === 'function') {
    return transformAssetsFn
  }

  if (transformMode === 'options') {
    if (optionsKind === 'transform') {
      return {
        transform: transformAssetsFn,
        cache,
        warmup,
      }
    }

    return {
      createTransform: async () => {
        return transformAssetsFn
      },
      cache,
      warmup,
    }
  }

  return cdn
}

const createDeprecatedTransformAssetUrlsConfig = (
  cdn: string,
): TransformAssetUrls => {
  if (transformMode === 'function') {
    return ({ url }) => `${cdn}${url}`
  }

  if (transformMode === 'options') {
    if (optionsKind === 'transform') {
      return {
        transform: ({ url }) => `${cdn}${url}`,
        cache,
        warmup,
      }
    }

    return {
      createTransform: async () => {
        return ({ url }) => `${cdn}${url}`
      },
      cache,
      warmup,
    }
  }

  return cdn
}

const handler = createStartHandler(
  cdnOrigin
    ? {
        handler: defaultStreamHandler,
        ...(useDeprecatedTransformAssetUrls
          ? {
              transformAssetUrls: createDeprecatedTransformAssetUrlsConfig(
                cdnOrigin.replace(/\/+$/, ''),
              ),
            }
          : {
              transformAssets: createTransformAssetsConfig(
                cdnOrigin.replace(/\/+$/, ''),
              ),
            }),
      }
    : defaultStreamHandler,
)

export default createServerEntry({ fetch: handler })
