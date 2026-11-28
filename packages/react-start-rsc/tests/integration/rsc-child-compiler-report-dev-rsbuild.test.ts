/**
 * An Rsbuild dev server (RSC on) whose server compiler runs a child
 * compiler (a plugin's `createChildCompiler`, as a worker plugin does) with
 * a denied file in it: its entry, a module a pattern import of its entry
 * reaches (`import.meta.webpackContext`), or a static import of its entry.
 * `onViolation` hears about it once, under both behaviours: the child's
 * module is in the parent compilation's graph, reached from the child's
 * entry, though no module of the parent imports it.
 * Source: the RSC phase 1 re-check 3 (/var/tmp/rsc-p1-recheck3/report.md
 * §3, `childcheck.py`: 2169b4165c called it 0 times for the entry and the
 * pattern import under `behavior: 'error'`, db260cf3a3 once),
 * design-rsc-phase1-settlement.md §5, S3, S3c.
 */
import { describe, expect, test } from 'vitest'
import { recorder, summary } from './rsc-environments-app'
import { startRscRsbuildDevServer } from './rsc-serial'

const route = `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../feature'
const label = createIsomorphicFn()
  .server(() => read())
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main data-testid="label">{label()}</main>
}
`

const shapes = [
  {
    shape: 'the child entry',
    entry: 'private.client.ts',
    child: null,
    reported: 'ssr server file private.client.ts -> src/private.client.ts',
  },
  {
    shape: "a pattern import of the child's entry",
    entry: 'child.ts',
    child: `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /private\\.client\\.ts$/,
})
globalThis.child = files('./private.client.ts').denied()
`,
    reported: 'ssr server file private.client.ts -> src/private.client.ts',
  },
  {
    shape: "a static import of the child's entry",
    entry: 'child.ts',
    child: `import { denied } from './private.client'
globalThis.child = denied()
`,
    reported: 'ssr server file child.ts -> ./private.client',
  },
]

describe('Rsbuild dev with RSC, a denied file of a child compiler only', () => {
  test.for(
    shapes.flatMap((shape) =>
      (['mock', 'error'] as const).map((behavior) => ({ ...shape, behavior })),
    ),
  )(
    '$shape, $behavior: onViolation hears about it once',
    async ({ entry, child, reported, behavior }) => {
      const { violations, start } = recorder(behavior)
      await startRscRsbuildDevServer({
        start,
        config: {
          tools: {
            rspack: (
              config: { plugins: Array<unknown> },
              { environment }: { environment: { name: string } },
            ) => {
              if (environment.name !== 'ssr') {
                return
              }
              config.plugins.push({
                apply(compiler: any) {
                  compiler.hooks.make.tapPromise(
                    'ChildOfTest',
                    async (compilation: any) => {
                      const childCompiler = compilation.createChildCompiler(
                        'childOfTest',
                        { filename: 'child-of-test.js' },
                        [
                          new compiler.rspack.EntryPlugin(
                            compiler.context,
                            `./src/${entry}`,
                            { name: 'child' },
                          ),
                        ],
                      )
                      await new Promise<void>((resolve, reject) =>
                        childCompiler.runAsChild((error: unknown) =>
                          error ? reject(error) : resolve(),
                        ),
                      )
                    },
                  )
                },
              })
            },
          },
        },
        files: {
          'src/routes/index.tsx': route,
          'src/feature.ts': `export const read = () => 'PARENT_OK'\n`,
          'src/private.client.ts': `export const denied = () => 'CHILD_REAL'\n`,
          ...(child && { 'src/child.ts': child }),
        },
      })
      expect({
        reported: summary(violations),
        calls: violations.length,
      }).toEqual({ reported: [reported], calls: 1 })
    },
  )
})
