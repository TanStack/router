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

  // Bug: the router plugin reads the compiler's `mode` when it is applied,
  // before webpack fills in its default (`production`): a configuration
  // without `mode` built in the plugin's dev mode.
  // Source: src/hosts/webpack.ts (`compiler.options.mode === 'production'`).
  // Impact: the production bundle ships route HMR code (`__tsrRouteHmr`
  // calls, the lazy wrappers' hot slots).
  test(
    'a production react client bundle of a configuration without mode has no dev-only code',
    async () => {
      await expectProductionClientBundle(
        'webpack',
        'react',
        true,
        undefined,
        true,
      )
    },
    timeout,
  )
})
