import type * as App from './src/app'
import { createSetup } from '../shared'

const appModulePath = './dist/app.js'
const {
  mountTestApp,
  resolveAllSlowLoaders,
  resolveSlowLoader,
  slowLoaderRegistry,
} = (await import(/* @vite-ignore */ appModulePath)) as typeof App

export function setup() {
  return createSetup(
    'vue',
    mountTestApp,
    resolveAllSlowLoaders,
    resolveSlowLoader,
    slowLoaderRegistry,
  )
}
