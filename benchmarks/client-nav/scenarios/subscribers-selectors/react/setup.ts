import type * as App from './src/app'
import { createSubscribersSelectorsWorkload } from '../workload.ts'

const appModulePath = './dist/app.js'
const app = (await import(/* @vite-ignore */ appModulePath)) as typeof App

export const workload = createSubscribersSelectorsWorkload('react', app)
