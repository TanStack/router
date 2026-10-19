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

  // Bug: with automatic code splitting off, the composed router plugin adds
  // the route HMR plugin unless `NODE_ENV` is `production` when the plugin
  // is created (`router-composed-plugin.ts`), instead of following the
  // bundler's mode; webpack and Rspack set `NODE_ENV` only inside the
  // bundle. For every framework; the React row is also the pin of the
  // control in known-bugs-route-hmr-production.test.ts. (Rspack:
  // build-production.test.ts.)
  // Source: gap CC-P1 / M3.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` ship the route HMR code of every route.
  test.fails.each(frameworks)(
    'a production %s client bundle without code splitting has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle('webpack', framework, false)
    },
    timeout,
  )
})
