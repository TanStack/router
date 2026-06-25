import type * as App from './src/app'
import { createPreloadingWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { getPreloadingCounters, mountTestApp, resetPreloadingCounters } =
  (await import(/* @vite-ignore */ appModulePath)) as typeof App

export const workload = createPreloadingWorkload(
  'react',
  mountTestApp,
  getPreloadingCounters,
  resetPreloadingCounters,
)
