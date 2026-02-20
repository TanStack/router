import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const cdnOrigin = process.env.CDN_ORIGIN
const transformMode = process.env.TRANSFORM_ASSET_URLS_MODE || 'string'
const optionsKind =
  process.env.TRANSFORM_ASSET_URLS_OPTIONS_KIND || 'createTransform'
const optionsCache = process.env.TRANSFORM_ASSET_URLS_OPTIONS_CACHE || 'true'
const optionsWarmup = process.env.TRANSFORM_ASSET_URLS_OPTIONS_WARMUP || 'true'

const cache = optionsCache !== 'false'
const warmup = optionsWarmup === 'true'

console.log(
  `[server-entry]: using custom server entry with transformAssetUrls (${transformMode}${transformMode === 'options' ? `:${optionsKind}` : ''})${cdnOrigin ? ` (CDN: ${cdnOrigin})` : ' (no CDN)'}`,
)

const handler = createStartHandler(
  cdnOrigin
    ? {
        handler: defaultStreamHandler,
        transformAssetUrls: (() => {
          const cdn = cdnOrigin.replace(/\/+$/, '')

          if (transformMode === 'function') {
            return ({ url }: { url: string }) => `${cdn}${url}`
          }

          if (transformMode === 'options') {
            if (optionsKind === 'transform') {
              return {
                transform: ({ url }: { url: string }) => `${cdn}${url}`,
                cache,
                warmup,
              }
            }

            return {
              createTransform: async () => {
                return ({ url }: { url: string }) => `${cdn}${url}`
              },
              cache,
              warmup,
            }
          }

          return cdn
        })(),
      }
    : defaultStreamHandler,
)

export default createServerEntry({ fetch: handler })
