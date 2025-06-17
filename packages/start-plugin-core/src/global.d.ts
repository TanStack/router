import type { Manifest } from '@tanstack/router-core'
import type { Rollup } from 'vite'

/* eslint-disable no-var */
declare global {
  var TSS_APP_BASE: string
  var TSS_ROUTES_MANIFEST: Manifest
  var TSS_CLIENT_BUNDLE: Rollup.OutputBundle
}
export {}
