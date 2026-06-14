import type { ClientNavWorkload } from '#client-nav/benchmark'
import type * as App from './src/app'
import { createInterruptedNavigationsWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { interruptedNavigationRuntime, mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload: ClientNavWorkload = createInterruptedNavigationsWorkload(
  'react',
  mountTestApp,
  interruptedNavigationRuntime,
)
