import type * as App from './src/app'
import { createControlFlowWorkload } from '../workload'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export const workload = createControlFlowWorkload('vue', mountTestApp)
