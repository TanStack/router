import type { ClientNavWorkload } from '#client-nav/benchmark'
import type * as App from './src/app'
import { createHeadManagementWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload: ClientNavWorkload = createHeadManagementWorkload(
  'solid',
  mountTestApp,
)
