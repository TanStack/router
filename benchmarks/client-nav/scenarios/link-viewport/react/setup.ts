import { createScenarioSetup } from '../../harness'
import {
  createViewportObserverStub,
  initialUrl,
  scenarioSteps,
} from '../shared'
import type * as App from './src/main'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export function setup() {
  const observerStub = createViewportObserverStub()
  return observerStub.wrap(
    createScenarioSetup({
      frameworkLabel: 'React',
      mount: mountTestApp,
      steps: scenarioSteps,
      assertAfterStep: observerStub.assertStepResult,
      initialUrl,
    }),
  )
}
