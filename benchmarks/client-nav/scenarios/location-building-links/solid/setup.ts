import type { ClientNavWorkload } from '#client-nav/benchmark'
import type * as App from './src/app'
import { createLocationBuildingLinksWorkload } from '../shared.ts'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload: ClientNavWorkload = createLocationBuildingLinksWorkload(
  'solid',
  mountTestApp,
)
