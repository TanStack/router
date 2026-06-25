import type * as App from './src/app'
import { createHydrationResumeWorkload } from '../workload'

const appModulePath = './dist/app.js'
const appModule = (await import(/* @vite-ignore */ appModulePath)) as typeof App

export const workload = createHydrationResumeWorkload('solid', appModule)
