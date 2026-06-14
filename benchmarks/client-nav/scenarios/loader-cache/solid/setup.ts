import type { ClientNavWorkload } from '#client-nav/benchmark'
import type * as App from './src/app'
import { createLoaderCacheWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { loaderCacheRuntime, mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload: ClientNavWorkload = createLoaderCacheWorkload(
  'solid',
  mountTestApp,
  loaderCacheRuntime,
)
