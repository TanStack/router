// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in tests/outside-compiler-corpus/regression-helpers.test.ts
// (fast tier).
/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`), and the route HMR page
 * (`route-hmr-page.ts`).
 *
 * Harness controls, outside the compiler test corpus (see
 * packages/compiler-test-utils/AGENTS.md): they check the test helpers, not
 * the compiler, and drive the current compiler where a rewrite may differ in
 * the incidental details they lean on. `test:implementation` runs them.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { generatorDevApp, route } from '../../generator-dev-app'
import { buildAndRun, head } from '../../regression-helpers'
import {
  expectEditShownOrReportedFallback,
  openRouteHmrPage,
} from '../../route-hmr-page'
import type { Rspack } from '@rsbuild/core'
import type { RouteHmrPage } from '../../route-hmr-page'

describe('buildAndRun', () => {
  // A real app's package.json has no side-effect hint unless the app adds
  // one: a module the route file imports for its side effect runs.
  it.each([
    { sideEffects: undefined, ran: true },
    { sideEffects: false, ran: false },
  ])(
    'keeps a side-effect import unless the app declares "sideEffects": $sideEffects',
    async ({ sideEffects, ran }) => {
      expect(
        await buildAndRun(
          `${head}import '../effect'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })`,
          `return globalThis.effectRan === true`,
          {
            sideEffects,
            files: { 'effect.ts': `;(globalThis as any).effectRan = true\n` },
          },
        ),
      ).toBe(ran)
    },
    30_000,
  )
})

// Controls of the route HMR page (`openRouteHmrPage`): it tells kept state
// from lost state, a hot update from a full reload (the browser's own
// reload API, as a user pressing reload), an update the page applied
// without showing the edit (it fails without waiting for its timeout), and
// what the page logged. A React app whose route component renders a
// counter.
describe.each(['vite', 'rsbuild'] as const)(
  'openRouteHmrPage (%s)',
  (bundler) => {
    const route = (
      version: string,
      child = 'Counter',
      effect = '',
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function ${child}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${child} ${version} count {count}</button>
}
function Page() {
  ${effect}
  return <div><${child} /></div>
}
export const Route = createFileRoute('/')({ component: Page })
`

    it('sees kept state, lost state, full reloads and what the page logs', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'Counter v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('Counter v1 count 1')
      // An edit of the component's body: React Refresh keeps its state.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v2') },
          'Counter v2 count 1',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      // A component the edit renames is another component for React Refresh:
      // React mounts it anew.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v3', 'Renamed') },
          'Renamed v3 count 0',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      // What the app logs with `console.error` during an edit is reported.
      expect(
        await app.edit(
          {
            'routes/index.tsx': route(
              'v4',
              'Renamed',
              `console.error('MARK_LOGGED')`,
            ),
          },
          'Renamed v4 count 0',
        ),
      ).toEqual({ reloaded: false, errors: ['MARK_LOGGED'] })
      // A full reload of the page (here: the browser's own reload) counts
      // as a load; the app starts anew.
      const loads = app.loads()
      await app.page.page.reload()
      await app.page.waitForText('Renamed v4 count 0')
      expect(app.loads()).toBe(loads + 1)
    }, 60_000)

    it('keeps observing edit-associated errors and reloads after the new text appears', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'Counter v1 count 0',
      })
      // The edited component exposes a completion signal. Releasing it
      // schedules a real document reload after edit() has seen the new text.
      // This controls the observer, not bundler propagation or Refresh.
      const edited = route(
        'v2',
        'Counter',
        `useEffect(() => {
        window.finishEditObservation = () => {
          console.error('MARK_DELAYED_EDIT_ERROR')
          setTimeout(() => location.reload(), 0)
        }
      }, [])`,
      ).replace('import { useState }', 'import { useState, useEffect }')
      const result = await app.edit(
        { 'routes/index.tsx': edited },
        'Counter v2 count 0',
      )
      expect(result).toEqual({ reloaded: false, errors: [] })
      await Promise.all([
        app.page.page.waitForEvent('load'),
        app.evaluate('window.finishEditObservation()'),
      ])
      await app.page.waitForText('Counter v2 count 0')
      expect(result.reloaded).toBe(true)
      expect(result.errors).toContain('MARK_DELAYED_EDIT_ERROR')
    }, 60_000)

    // A warning the app itself logs (in the page) naming its route file is
    // one of the page's warnings, by the A9 oracle. (No warning of the
    // compiler is the control: a compiler that splits everything has
    // nothing to report. The dev server's own channels go through the same
    // `diagnosticsOf` reading; ctu's diagnostics tests cover the capture.)
    it("reports the warnings naming the app's route file", async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
console.warn('MARK_WARNING: check routes/index.tsx')
export const Route = createFileRoute('/')({ component: () => <p>warned page</p> })
`,
        },
        ready: 'warned page',
      })
      expect(
        findDiagnostics(app.warnings(), {
          file: 'routes/index.tsx',
          root: app.root,
        }).some(({ text }) => text.includes('MARK_WARNING')),
      ).toBe(true)
    }, 60_000)

    // A test plugin warns through the bundler's own plugin channel (a Vite
    // plugin's `this.warn`, an Rspack compilation warning), naming a route
    // file: the page reads it from the dev server, and tells which file it
    // names. The capture is tested on its own, with a synthetic warning:
    // whether the compiler warns about a route is not this helper's
    // business (V1R hmr H09, split S09).
    it.for([
      { warned: 'routes/index.tsx', on: /routes[\\/]index\.tsx$/, found: 1 },
      { warned: 'routes/other.tsx', on: /main\.tsx$/, found: 0 },
    ])(
      "reports a bundler warning naming the app's route file ($warned)",
      { timeout: 60_000 },
      async ({ warned, on, found }) => {
        const message = (root: string) =>
          `MARK_SYNTHETIC_WARNING about ${path.join(root, warned)}`
        const app = await openRouteHmrPage({
          bundler,
          files: {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })
`,
          },
          plugins: {
            vite: [
              {
                name: 'test:synthetic-warning',
                // On the module `on` (Vite names it with the warning).
                transform(_code, id) {
                  if (on.test(id)) {
                    this.warn(message(this.environment.config.root))
                  }
                },
              },
            ],
            rsbuild: [
              {
                name: 'test:synthetic-warning',
                setup(api) {
                  api.modifyRspackConfig((config, { rspack }) => {
                    config.plugins.push({
                      apply(compiler: Rspack.Compiler) {
                        compiler.hooks.thisCompilation.tap(
                          'test:synthetic-warning',
                          (compilation) => {
                            compilation.hooks.processAssets.tap(
                              'test:synthetic-warning',
                              () => {
                                compilation.warnings.push(
                                  new rspack.WebpackError(
                                    message(api.context.rootPath),
                                  ),
                                )
                              },
                            )
                          },
                        )
                      },
                    })
                  })
                },
              },
            ],
          },
          ready: 'page',
        })
        const warnings = app.warnings()
        expect(
          findDiagnostics(warnings, { names: ['MARK_SYNTHETIC_WARNING'] })
            .length,
          'the synthetic warning is captured',
        ).toBeGreaterThan(0)
        expect(
          findDiagnostics(warnings, {
            file: 'routes/index.tsx',
            root: app.root,
          }).length > 0,
        ).toBe(found > 0)
      },
    )

    it('fails an edit the page applied without showing it, without waiting for its timeout', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'Counter v1 count 0',
      })
      const started = Date.now()
      await expect(
        app.edit({ 'routes/index.tsx': route('v2') }, 'Counter v3', {
          timeout: 20_000,
        }),
      ).rejects.toThrow(/applied the update .* but the page does not show/s)
      expect(Date.now() - started).toBeLessThan(10_000)
    }, 60_000)
  },
)

// The decision of `expectEditShownOrReportedFallback`, on the outcomes a
// page's `edit()` reports (V1R hmr H08, split S11): the edit must show,
// without errors; a reload is allowed only with a warning naming the file.
// (That `edit()` fails when the page does not show the edit is the control
// above.)
describe('expectEditShownOrReportedFallback', () => {
  const page = (
    outcome: { reloaded: boolean; errors: Array<string> } | Error,
    warnings: Array<string>,
  ) =>
    ({
      root: '/app',
      edit: () =>
        outcome instanceof Error
          ? Promise.reject(outcome)
          : Promise.resolve(outcome),
      warnings: () => diagnosticsOf(warnings, 'warning'),
    }) as unknown as RouteHmrPage
  const edit = (app: RouteHmrPage) =>
    expectEditShownOrReportedFallback(
      app,
      { 'routes/index.tsx': 'v2' },
      'v2',
      'routes/index.tsx',
    )
  const warned = ['the route in /app/routes/index.tsx is left unsplit']

  it('an edit in place passes, with or without a warning', async () => {
    const inPlace = { reloaded: false, errors: [] }
    expect(await edit(page(inPlace, []))).toBe('in place')
    expect(await edit(page(inPlace, warned))).toBe('reported fallback')
  })

  it('a reload passes only with a warning naming the file', async () => {
    const reload = { reloaded: true, errors: [] }
    expect(await edit(page(reload, warned))).toBe('reported fallback')
    await expect(edit(page(reload, []))).rejects.toThrow(/in place/)
    await expect(
      edit(
        page(reload, ['the route in /app/routes/other.tsx is left unsplit']),
      ),
    ).rejects.toThrow(/in place/)
  })

  it('a warning never excuses an edit that does not show, or errors', async () => {
    await expect(
      edit(page(new Error('the page did not show the edit'), warned)),
    ).rejects.toThrow('did not show')
    await expect(
      edit(page({ reloaded: true, errors: ['broken'] }, warned)),
    ).rejects.toThrow()
  })
})

// What a dev app's plugins print reaches `diagnostics(since)` through every
// channel of the test process: console methods and direct stdout/stderr
// writes (V1R gen G13; W4-gen). Only what follows the mark counts.
describe('generatorDevApp diagnostics', () => {
  it('reads every console method and direct stdout/stderr writes after a mark', async () => {
    const app = await generatorDevApp({
      bundler: 'vite',
      files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
    })
    console.error('MARK_BEFORE routes/early.tsx')
    const since = app.mark()
    console.warn('MARK_WARN routes/a.tsx')
    console.log('MARK_LOG routes/b.tsx')
    process.stderr.write('MARK_STDERR routes/c.tsx\n')
    process.stdout.write('MARK_STDOUT routes/d.tsx\n')
    const texts = app
      .diagnostics(since)
      .map((diagnostic) => `${diagnostic.severity} ${diagnostic.text}`)
    for (const expected of [
      'warning MARK_WARN',
      'info MARK_LOG',
      'warning MARK_STDERR',
      'info MARK_STDOUT',
    ]) {
      expect(texts.some((text) => text.startsWith(expected))).toBe(true)
    }
    expect(texts.join('\n')).not.toContain('MARK_BEFORE')
    expect(
      findDiagnostics(app.diagnostics(since), {
        severity: 'warning',
        file: 'routes/c.tsx',
      }),
    ).toHaveLength(1)
  })
})
