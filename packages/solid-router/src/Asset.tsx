import { isServer } from '@tanstack/router-core/isServer'
import { createEffect, onCleanup, onSettled } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

const INLINE_CSS_HYDRATION_ATTR = 'data-tsr-inline-css'

export function Asset(asset: RouterManagedTag): JSX.Element | null {
  const { tag, attrs, children } = asset

  switch (tag) {
    case 'title':
      return <Title attrs={attrs} children={children} />
    case 'meta':
      return <HeadElement tag="meta" attrs={attrs} />
    case 'link':
      return <HeadElement tag="link" attrs={attrs} />
    case 'style':
      if (
        asset.inlineCss &&
        (process.env.TSS_INLINE_CSS_ENABLED === 'true' ||
          (process.env.TSS_INLINE_CSS_ENABLED === undefined && isServer))
      ) {
        return <InlineCssStyle attrs={attrs}>{children}</InlineCssStyle>
      }

      return <HeadElement tag="style" attrs={attrs} children={children} />
    case 'script':
      return <Script attrs={attrs} children={children} />
    default:
      return null
  }
}

// On the client, relocate a rendered head element into document.head so head
// tags end up in the right place even when <HeadContent /> is rendered in
// <body>. The *same* node that Solid rendered/hydrated is moved — never
// recreated — so the server-rendered node stays claimed (its hydration id is
// preserved) and stylesheets/scripts are not refetched or re-executed.
//
// When <HeadContent /> is placed in <head> (the SSR/hydration case), the node
// is already in document.head, so this is a no-op and the element is left
// exactly where Solid hydrated it.
function useRelocateToHead(getEl: () => Node | undefined) {
  onSettled(() => {
    const el = getEl()
    if (el && el.parentNode !== document.head) {
      document.head.appendChild(el)
    }
  })

  onCleanup(() => {
    const el = getEl()
    if (el?.parentNode) {
      el.parentNode.removeChild(el)
    }
  })
}

function InlineCssStyle({
  attrs,
  children,
}: {
  attrs?: Record<string, any>
  children?: RouterManagedTag['children']
}) {
  const isInlineCssPlaceholder = children === undefined
  const html = isInlineCssPlaceholder
    ? typeof document === 'undefined'
      ? ''
      : (document.querySelector<HTMLStyleElement>(
          `style[${INLINE_CSS_HYDRATION_ATTR}]`,
        )?.textContent ?? '')
    : (children ?? '')

  return (
    <HeadElement
      tag="style"
      attrs={{ ...attrs, [INLINE_CSS_HYDRATION_ATTR]: '' }}
      children={html}
    />
  )
}

interface ScriptAttrs {
  [key: string]: string | boolean | undefined
  src?: string
}

function HeadElement(props: {
  tag: 'meta' | 'link' | 'style'
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  // Each branch must live in its own `case` block so the Solid compiler emits
  // exactly ONE getNextElement() per invocation. Sequential `if ... return`
  // statements compile to multiple getNextElement() calls that all execute,
  // desyncing the hydration key counter (causing "expected <style>" mismatches
  // and unclaimed nodes).
  //
  // We capture the element via the JSX return value (a real DOM node in Solid)
  // rather than a `ref` attribute: a `ref` compiles to a _$ref() call that
  // interferes with attribute spreading on hydration-claimed nodes (wiping the
  // SSR attributes).
  let element: Element
  switch (props.tag) {
    case 'style': {
      const attrs = {
        ...props.attrs,
        innerHTML:
          typeof props.children === 'string' ? props.children : undefined,
      }
      element = (<style {...attrs} />) as unknown as Element
      break
    }
    case 'meta':
      element = (<meta {...props.attrs} />) as unknown as Element
      break
    default:
      element = (<link {...props.attrs} />) as unknown as Element
  }

  // Move the rendered/hydrated element into <head> when <HeadContent /> is
  // placed in <body>. No-op when already in <head>. Called unconditionally so
  // server and client register the same primitives (see Title).
  useRelocateToHead(() => element)

  return element as unknown as JSX.Element
}

function Title(props: {
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  let el: HTMLTitleElement | undefined

  // IMPORTANT: call these hooks UNCONDITIONALLY (do not guard with isServer).
  // Solid's hydration relies on the component body registering the same
  // reactive primitives in the same order on the server and the client. An
  // `if (!isServer)` guard would skip them on the server but run them on the
  // client, desyncing the hydration owner tree and causing the server <title>
  // to be left unclaimed (and a duplicate appended). These hooks are no-ops
  // during SSR anyway.

  // Move the rendered/hydrated <title> into <head> when <HeadContent /> is
  // placed in <body>. No-op when already in <head>.
  useRelocateToHead(() => el)

  // Keep document.title in sync during client-side navigation.
  createEffect(
    () => props.children,
    (titleText) => {
      document.title = typeof titleText === 'string' ? titleText : ''
    },
  )

  return (
    <title ref={(e) => (el = e)} {...props.attrs}>
      {props.children as string}
    </title>
  )
}

function Script(props: {
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  const router = useRouter()
  const attrs = props.attrs
  const children = props.children

  const dataScript =
    typeof attrs?.type === 'string' &&
    attrs.type !== '' &&
    attrs.type !== 'text/javascript' &&
    attrs.type !== 'module'

  // --- Server rendering ---
  if (isServer ?? router.isServer) {
    if (attrs?.src) {
      return <script {...attrs} />
    }

    if (typeof children === 'string') {
      return <script {...attrs} innerHTML={children} />
    }

    return null
  }

  // --- Client rendering ---

  // Data scripts (e.g. application/ld+json) are rendered in the tree;
  // they don't need to execute.
  if (dataScript && typeof children === 'string') {
    return <script {...attrs} innerHTML={children} />
  }

  // For executable scripts, use imperative DOM injection so the browser
  // actually executes them during client-side navigation. The injection is
  // idempotent (it checks for an already-present matching script), so the
  // server-rendered script node is reused rather than duplicated.
  createEffect(
    () => ({ attrs, children, dataScript }) as const,
    ({ attrs, children, dataScript }) => {
      if (dataScript) return

      let script: HTMLScriptElement | undefined

      if (attrs?.src) {
        const normSrc = (() => {
          try {
            const base = document.baseURI || window.location.href
            return new URL(attrs.src, base).href
          } catch {
            return attrs.src
          }
        })()
        const existingScript = Array.from(
          document.querySelectorAll('script[src]'),
        ).find((el) => (el as HTMLScriptElement).src === normSrc)

        if (existingScript) {
          return
        }

        script = document.createElement('script')

        for (const [key, value] of Object.entries(attrs)) {
          if (value !== undefined && value !== false) {
            script.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }

        document.head.appendChild(script)
      } else if (typeof children === 'string') {
        const typeAttr =
          typeof attrs?.type === 'string' ? attrs.type : 'text/javascript'
        const nonceAttr =
          typeof attrs?.nonce === 'string' ? attrs.nonce : undefined
        const existingScript = Array.from(
          document.querySelectorAll('script:not([src])'),
        ).find((el) => {
          if (!(el instanceof HTMLScriptElement)) return false
          const sType = el.getAttribute('type') ?? 'text/javascript'
          const sNonce = el.getAttribute('nonce') ?? undefined
          return (
            el.textContent === children &&
            sType === typeAttr &&
            sNonce === nonceAttr
          )
        })

        if (existingScript) {
          return
        }

        script = document.createElement('script')
        script.textContent = children

        if (attrs) {
          for (const [key, value] of Object.entries(attrs)) {
            if (value !== undefined && value !== false) {
              script.setAttribute(
                key,
                typeof value === 'boolean' ? '' : String(value),
              )
            }
          }
        }

        document.head.appendChild(script)
      }

      return () => {
        if (script?.parentNode) {
          script.parentNode.removeChild(script)
        }
      }
    },
  )

  return null
}
