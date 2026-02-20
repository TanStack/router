import * as React from 'react'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useTags } from './headContentUtils'

/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head of your app shell.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
export function HeadContent() {
  const tags = useTags()
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  return (
    <>
      {tags.map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  )
}
