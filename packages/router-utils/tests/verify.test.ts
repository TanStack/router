// The output verifier (`TSR_COMPILER_VERIFY=1`, set for every test run)
// catches a planner's broken glue between the outputs of one file. Each case
// adds one broken import through a planner, the way a planner bug would emit
// it, and expects the compile to fail; a sound plan of the same module
// compiles.
import { describe, expect, it } from 'vitest'
import { sameFileSpecifier } from '../src/compiler/identity'
import { MemoryHost, dedent, envInfo, toySplitPlanner } from './helpers'
import type { OutputId, PlanContext, Planner } from '../src/compiler'

const CODE = dedent(`
  import { createFileRoute } from 'toy-router'
  export function Card() { return 'card' }
  export function Badge() { return 'badge' }
  function Page() { return Card() + Badge() }
  export const Route = createFileRoute('/')({ component: Page })
`)

/** The output of an extracted export, as the core names it. */
const exportOutput = (ctx: PlanContext, name: string): OutputId =>
  ctx.declareOutput({
    kind: 'export',
    key: `export~${name}`,
    derived: { kind: 'export', value: name },
    sideEffectFree: true,
  })

/** The id an output of this file is imported by. */
const idOf = (ctx: PlanContext, output: OutputId) =>
  output === 'env' ? ctx.identity.canonicalId : output.slice('derived:'.length)

/** Adds `import { <imported> as <local> } from '<to>'` plus `<use>` to `home`. */
function brokenGlue(
  ctx: PlanContext,
  home: OutputId,
  to: OutputId,
  imported: string,
  use: (local: string) => string,
) {
  const local = ctx.names.alloc(`__broken${imported}`)
  const specifier = sameFileSpecifier(idOf(ctx, to))
  ctx.rewrites.addGenerated({
    body: [{ k: 'text', parts: [use(local.name)] }],
    declares: [],
    effectful: true,
    anchor: { k: 'end' },
    home,
    by: 'toy-broken-glue',
    imports: [
      {
        names: [{ imported, local: local.sym }],
        spec: {
          k: 'spec',
          specifier,
          edgeKey: ctx.edgeKey(specifier, 'static', 'runtime'),
          provenance: { origin: 'runtime' },
        },
      },
    ],
  })
}

const brokenPlanner = (edit: ((ctx: PlanContext) => void) | null): Planner => ({
  name: 'toy-broken-glue',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    edit?.(ctx)
  },
})

const CASES: Array<{
  check: string
  error: string
  edit: (ctx: PlanContext) => void
}> = [
  {
    check: '(b) an import of a name its home output does not export',
    error: 'which does not export it',
    edit: (ctx) =>
      brokenGlue(
        ctx,
        `derived:${ctx.identity.canonicalId}?tsr-split=component`,
        'env',
        'NOPE',
        (l) => `console.log(${l})\n`,
      ),
  },
  {
    check: '(e) an extracted module reading the env module at its evaluation',
    error: 'of the env module at its evaluation',
    edit: (ctx) =>
      brokenGlue(
        ctx,
        exportOutput(ctx, 'Card'),
        'env',
        'Route',
        (l) => `console.log(${l})\n`,
      ),
  },
  {
    check: '(h) two extracted modules importing each other',
    error: 'import cycle of extracted modules',
    edit: (ctx) => {
      const card = exportOutput(ctx, 'Card')
      const badge = exportOutput(ctx, 'Badge')
      brokenGlue(
        ctx,
        card,
        badge,
        'Badge',
        (l) => `export const b = () => ${l}\n`,
      )
      brokenGlue(
        ctx,
        badge,
        card,
        'Card',
        (l) => `export const c = () => ${l}\n`,
      )
    },
  },
]

// a `!` path imports its outputs by basename (`./route.tsx?…`), any other by
// its absolute path
describe.each(['/app/src', '/app/s!rc'])('the verifier under %s', (dir) => {
  const path = `${dir}/route.tsx`
  const compile = (edit: ((ctx: PlanContext) => void) | null) => {
    const host = new MemoryHost({ files: { [path]: CODE } })
    return host.compile(
      path,
      [toySplitPlanner({ extractExports: true }), brokenPlanner(edit)],
      { env: envInfo({ mode: 'build' }) },
    )
  }

  it('passes the sound plan', async () => {
    const out = await compile(null)
    expect(out!.diagnostics).toEqual([])
  })

  // the bundler erases a type-only import: no output needs the export
  it.each([
    ['relative', './route.tsx'],
    ['absolute', `${dir}/route.tsx`],
  ])('passes a type-only import of the module itself (%s)', async (_, from) => {
    const host = new MemoryHost({
      files: {
        [path]: dedent(`
          import { createFileRoute } from 'toy-router'
          import type { Props } from '${from}'
          export interface Props { n: number }
          export const Route = createFileRoute('/')({ component: (p: Props) => p.n })
        `),
      },
    })
    const out = await host.compile(path, [toySplitPlanner()], {
      env: envInfo({ mode: 'build' }),
    })
    expect(out!.diagnostics).toEqual([])
  })

  it.each(CASES)('fails $check', async ({ edit, error }) => {
    await expect(compile(edit)).rejects.toThrow(error)
  })
})
