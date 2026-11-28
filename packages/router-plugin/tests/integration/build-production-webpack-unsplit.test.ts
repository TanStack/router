/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support): webpack with automatic code splitting
 * off. The checks and their oracles are in ../production-bundle.ts;
 * the code-splitting rows are in build-production-webpack.test.ts, the
 * other bundlers' rows in build-production.test.ts (one file per group, to
 * keep each file within its time budget).
 */
import { describe, test } from 'vitest'
import { frameworks } from '../build-harness'
import { expectProductionClientBundle } from '../production-bundle'

describe('webpack', () => {
  // Bug: with automatic code splitting off, the composed router plugin adds
  // the route HMR plugin unless `NODE_ENV` is `production` when the plugin
  // is created (`router-composed-plugin.ts`), instead of following the
  // bundler's mode; webpack and Rspack set `NODE_ENV` only inside the
  // bundle. For every framework. (Rspack: build-production.test.ts.)
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` ship the route HMR code of every route.
  test.each(frameworks)(
    'a production %s client bundle without code splitting has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle('webpack', framework, false)
    },
  )
})
