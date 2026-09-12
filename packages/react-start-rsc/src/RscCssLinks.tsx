'use client'

import { shouldManageRscCss } from './shouldManageRscCss'

/**
 * Browser-only stylesheet links for a rendered RSC stream. SSR already
 * preinitializes styles, and a managed link there would make streamed content
 * require JavaScript to reveal it.
 */
export function RscCssLinks({
  hrefs,
}: {
  hrefs?: ReadonlySet<string>
}): React.ReactNode {
  if (!hrefs || typeof document === 'undefined' || !shouldManageRscCss()) {
    return null
  }
  return Array.from(hrefs, (href) => (
    <link key={href} rel="stylesheet" href={href} precedence="high" />
  ))
}
