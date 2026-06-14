import type * as App from './src/app'
import { createDeferredAwaitWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const {
  getDeferredRegistrySnapshot,
  mountTestApp,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
} = (await import(/* @vite-ignore */ appModulePath)) as typeof App

export const workload = createDeferredAwaitWorkload('solid', mountTestApp, {
  getDeferredRegistrySnapshot,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
})
