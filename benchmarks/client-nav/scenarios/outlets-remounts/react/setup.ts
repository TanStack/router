import type * as App from './src/app'
import { createOutletsRemountsWorkload } from '../workload'

const appModulePath = './dist/app.js'
const app = (await import(/* @vite-ignore */ appModulePath)) as typeof App

export const workload = createOutletsRemountsWorkload('react', app)
