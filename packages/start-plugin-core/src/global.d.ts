import type { AnyRoute } from '@tanstack/router-core'

/* eslint-disable no-var */
declare global {
  var TSS_ROUTES_MANIFEST: Record<
    string,
    {
      filePath: string
      children?: Array<string>
    }
  >
  var TSS_PRERENDABLE_PATHS: Array<{ path: string }> | undefined
  var TSS_PRERENDER_ROUTE_TREE:
    | (() => Promise<AnyRoute | undefined>)
    | undefined
}
export {}
