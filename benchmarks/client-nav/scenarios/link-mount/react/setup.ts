import { createScenarioSetup } from '../../harness'
import { assertStepResult, createScenarioSteps, readyTestId } from '../shared'
import type { LinkMountPreload } from '../shared'
import type * as App from './src/main'

const appModulePath = './dist/app.js'
const { mountIntentTestApp, mountTestApp, setLinksVisible } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export function setup(preload: LinkMountPreload = 'default') {
  return createScenarioSetup({
    frameworkLabel: 'React',
    mount: preload === 'intent' ? mountIntentTestApp : mountTestApp,
    steps: createScenarioSteps(setLinksVisible),
    assertAfterStep: assertStepResult,
    readyTestId,
  })
}
