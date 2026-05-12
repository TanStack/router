/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useRouter } from './useRouter'
import { subscribeStore } from './subscribe'
import { buildHeadTags } from './headContentUtils'
import { Asset } from './Asset'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

export interface HeadContentProps {
  assetCrossOrigin?: AssetCrossOriginConfig
}

/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
export function HeadContent(handle: Handle<HeadContentProps>) {
  const router = useRouter(handle)
  // Subscribe so head re-renders when matches change.
  void subscribeStore(handle, router.stores.matches)

  return (props: HeadContentProps): RemixNode => {
    const tags = buildHeadTags(router, props.assetCrossOrigin)
    const nonce = router.options.ssr?.nonce
    return (
      <>
        {tags.map((tag) => (
          <Asset
            tag={tag.tag as any}
            attrs={tag.attrs}
            children={tag.children}
            nonce={nonce}
            key={`tsr-meta-${JSON.stringify(tag)}`}
          />
        ))}
      </>
    )
  }
}
