import type * as App from './src/app'
import { createSetup } from '../shared'

const appModulePath = './dist/app.js'
const { getTrackedItemLoaderCount, mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export function setup() {
  return createSetup('vue', mountTestApp, getTrackedItemLoaderCount)
}
