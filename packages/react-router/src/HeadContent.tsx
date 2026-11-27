'use client'

import * as React from 'react'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useTags } from './headContentUtils'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

export interface HeadContentProps {
  assetCrossOrigin?: AssetCrossOriginConfig
}

/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head of your app shell.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  return (
    <>
      {tags.map((tag, i) => (
        <Asset
          {...tag}
          // Keys are not serialized and hydration matches by position, so the
          // server only needs a cheap unique key. The client keys by content
          // to avoid remounting unchanged tags across navigations.
          key={
            (isServer ?? router.isServer)
              ? i
              : `tsr-meta-${JSON.stringify(tag)}`
          }
          nonce={nonce}
        />
      ))}
    </>
  )
}
