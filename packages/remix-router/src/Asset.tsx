/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import type { Handle, RemixNode } from '@remix-run/ui'
import type { RouterManagedTag } from '@tanstack/router-core'

export type AssetProps = RouterManagedTag & { nonce?: string }

/**
 * Render a router-managed `<title>`, `<meta>`, `<link>`, `<style>`, or
 * `<script>` tag from a `RouterManagedTag` payload. Used by `<HeadContent>`
 * and `<Scripts>`.
 *
 * Mirrors `<Asset>` from `@tanstack/react-router`.
 */
export function Asset(handle: Handle<AssetProps>) {
  return (asset: AssetProps): RemixNode => {
    const { attrs, children, nonce } = asset
    switch (asset.tag) {
      case 'title':
        return <title {...(attrs as any)}>{children as any}</title>
      case 'meta':
        return <meta {...(attrs as any)} />
      case 'link':
        return <link {...(attrs as any)} nonce={nonce} />
      case 'style': {
        const html =
          typeof children === 'string' ? children : ''
        return (
          <style {...(attrs as any)} nonce={nonce} innerHTML={html} />
        )
      }
      case 'script': {
        const a = (attrs ?? {}) as Record<string, unknown>
        if (a.src) {
          return <script {...(a as any)} />
        }
        const html =
          typeof children === 'string' ? children : ''
        return (
          <script {...(a as any)} nonce={nonce} innerHTML={html} />
        )
      }
      default:
        return null
    }
  }
}
