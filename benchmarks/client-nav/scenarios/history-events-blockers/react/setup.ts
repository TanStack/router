import type { ClientNavWorkload } from '#client-nav/benchmark'
import type * as App from './src/app'
import { createHistoryEventsBlockersWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { historyEventsBlockersRuntime, mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload: ClientNavWorkload = createHistoryEventsBlockersWorkload(
  'react',
  mountTestApp,
  historyEventsBlockersRuntime,
)
