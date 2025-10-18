import type { Manifest } from '@tanstack/router-core'

/* eslint-disable no-var */
declare global {
  var TSS_ROUTES_MANIFEST: Manifest
  var TSS_PRERENDABLE_PATHS: Array<{ path: string }> | undefined
}
export {}
