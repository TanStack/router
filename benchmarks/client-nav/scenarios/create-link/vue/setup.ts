import { createScenarioSetup } from '../../harness'
import { assertStepResult, createScenarioSteps, readyTestId } from '../shared'
import type * as App from './src/main'

const appModulePath = './dist/app.js'
const { mountTestApp, setLinkListState } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export function setup() {
  return createScenarioSetup({
    frameworkLabel: 'Vue',
    mount: mountTestApp,
    steps: createScenarioSteps(setLinkListState),
    assertAfterStep: assertStepResult,
    readyTestId,
  })
}
