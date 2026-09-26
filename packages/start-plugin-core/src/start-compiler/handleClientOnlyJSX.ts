import type { JSXElement } from '@yuku-toolchain/types'

/**
 * Handles <ClientOnly> JSX elements on the server side.
 *
 * On the server, the children of <ClientOnly> should be removed since they
 * are client-only code. Only the fallback prop (if present) will be rendered.
 *
 * Transform:
 *   <ClientOnly fallback={<Loading />}>{clientOnlyContent}</ClientOnly>
 * Into:
 *   <ClientOnly fallback={<Loading />} />
 *
 * Or if no fallback:
 *   <ClientOnly>{clientOnlyContent}</ClientOnly>
 * Into:
 *   <ClientOnly />
 */
export function handleClientOnlyJSX(
  element: JSXElement,
  _opts: { env: 'server' },
): void {
  // Remove all children - they are client-only code
  element.children = []

  // Make it a self-closing element since there are no children
  element.openingElement.selfClosing = true
  element.closingElement = null
}
