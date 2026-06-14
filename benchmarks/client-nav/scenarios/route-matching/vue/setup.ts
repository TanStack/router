import type * as App from './src/app'
import { createRouteMatchingWorkload } from '../workload'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload = createRouteMatchingWorkload('vue', mountTestApp)
