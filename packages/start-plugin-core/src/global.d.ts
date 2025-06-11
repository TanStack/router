import type { Manifest } from '@tanstack/router-core'

/* eslint-disable no-var */
declare global {
  var TSS_APP_BASE: string
  var TSS_ROUTES_MANIFEST: Manifest
}
export {}
