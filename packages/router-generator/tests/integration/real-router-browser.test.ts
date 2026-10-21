/** Generated trees consumed by the real routers and renderers in Chromium. */
import { test } from 'vitest'
import { checkApp } from '../real-router'
import { frameworkCases, groupLayout, shapeCases } from '../real-router-cases'

test.each([...frameworkCases, ...shapeCases, groupLayout])(
  'the browser renders $name',
  (testCase) => checkApp(testCase, { types: false, client: true }),
)
