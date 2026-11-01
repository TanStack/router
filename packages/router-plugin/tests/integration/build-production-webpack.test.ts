/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support): webpack. The checks and their oracles
 * are in ../production-bundle.ts; the other bundlers' rows are in
 * build-production.test.ts (one file per bundler group, to keep each file
 * within its time budget).
 */
import { describe, test } from 'vitest'
import { frameworks } from '../build-harness'
import { expectProductionClientBundle, timeout } from '../production-bundle'

describe('webpack', () => {
  test.each(frameworks)(
    'a production %s client bundle has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle('webpack', framework, true)
    },
    timeout,
  )
})
