// The output verifier (`TSR_COMPILER_VERIFY=1`, set for every test run)
// catches a planner's broken glue between the outputs of one file. Each case
// adds one broken import through a planner, the way a planner bug would emit
// it, and expects the compile to fail; a sound plan of the same module
// compiles.
import { describe, expect, it } from 'vitest'
import { identify, sameFileSpecifier } from '../src/compiler/identity'
import { verifyPlan } from '../src/compiler/verify'
import { MemoryHost, dedent, envInfo, toySplitPlanner } from './helpers'
import { engine, rangeOf } from './engine'
import type { OutputId, PlanContext, Planner } from '../src/compiler'

const CODE = dedent(`
  import { createFileRoute } from 'toy-router'
  export function Card() { return 'card' }
  export function Badge() { return 'badge' }
  function Page() { return Card() + Badge() }
  export const Route = createFileRoute('/')({ component: Page })
`)

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

/** The split chunk's output, as the toy splitter declares it. */
const chunkOf = (ctx: PlanContext): OutputId =>
  `derived:${ctx.identity.canonicalId}?tsr-split=component`

/** Adds `text` (no import) to `home`, the way a planner bug would emit it. */
function brokenText(ctx: PlanContext, home: OutputId, text: string) {
  ctx.rewrites.addGenerated({
    body: [{ k: 'text', parts: [text] }],
    declares: [],
    effectful: true,
    anchor: { k: 'end' },
    home,
    by: 'toy-broken-glue',
  })
}

const CASES: Array<{
  check: string
  error: string
  edit: (ctx: PlanContext) => void
}> = [
  {
    check:
      '(a) generated text assigning a binding it imports from the env module',
    error: 'assigns the imported binding',
    edit: (ctx) =>
      brokenGlue(ctx, chunkOf(ctx), 'env', 'Card', (l) => `${l} = null\n`),
  },
  {
    check:
      '(g) generated text in a derived output naming a module binding it neither declares nor imports',
    error: 'which it neither declares nor imports',
    edit: (ctx) =>
      brokenText(ctx, chunkOf(ctx), 'console.log(createFileRoute)\n'),
  },
  {
    check: 'parse: generated text that is no syntax',
    error: 'the output does not parse',
    edit: (ctx) => brokenText(ctx, chunkOf(ctx), 'const = )(\n'),
  },
  {
    check: '(f) planner facts that are not JSON data',
    error: 'the planner facts are not JSON data',
    edit: (ctx) =>
      ctx.setFacts('toy-broken-glue', { value: undefined } as never),
  },
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
]

// a `!` path imports its outputs by basename (`./route.tsx?…`), any other by
// its absolute path
describe.each(['/app/src', '/app/s!rc'])('the verifier under %s', (dir) => {
  const path = `${dir}/route.tsx`
  const compile = (edit: ((ctx: PlanContext) => void) | null) => {
    const host = new MemoryHost({ files: { [path]: CODE } })
    return host.compile(path, [toySplitPlanner(), brokenPlanner(edit)], {
      env: envInfo({ mode: 'build' }),
    })
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

// (d) with a generated unit whose body text maps inside a top-level
// statement and which claims a region nested in it (a `<Hydrate>` chunk's
// wrapper, mapped to the boundary): the unit's own text is no rendering of
// the statement, which the env module emits once (spec-phase3 4.3 V2)
it('passes a derived output whose generated text maps inside a statement it claims part of', async () => {
  const code = dedent(`
    import { register } from './register'
    register(() => 'inner')
  `)
  const claimer: Planner = {
    name: 'toy-claimer',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const at = code.indexOf("'inner'")
      const range = { start: at, end: at + "'inner'".length }
      const output = ctx.declareOutput({
        kind: 'custom',
        key: 'claimed',
        derived: { kind: 'split', value: 'claimed' },
      })
      const region = ctx.region(range, 'custom')
      const owner = ctx.rewrites.addGenerated({
        body: [
          {
            k: 'text',
            parts: ['export const value = '],
            mapTo: code.indexOf('() =>'),
          },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [ctx.names.alloc('value').sym],
        effectful: false,
        anchor: { k: 'end' },
        home: output,
        by: 'toy-claimer',
      })
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: ['null'] }],
        by: 'toy-claimer',
      })
    },
  }
  const host = new MemoryHost({ files: { '/app/mod.ts': code } })
  const out = await host.compile('/app/mod.ts', [claimer], {
    env: envInfo({ mode: 'build' }),
  })
  expect(out!.code).toContain('register(() => null)')
})

// (d) on the emitted recipes themselves (`verifyPlan` of a tampered plan):
// a top-level statement is emitted exactly once, and a text segment that
// stands for its source (no `gen` marker) counts (spec-phase3 4.3 V3-V5)
describe('rule (d) on a tampered plan', () => {
  const code = 'track()\nexport const a = 1\n'
  const statement = rangeOf(code, 'track()')
  const planOf = () => {
    const e = engine(code)
    const derived = e.ctx.declareOutput({
      kind: 'custom',
      key: 'x',
      derived: { kind: 'split', value: 'x' },
      roots: [{ t: 'unit', id: 1 }],
    })
    return { e, emitPlan: e.freeze(), derived }
  }
  const verify = (
    e: ReturnType<typeof planOf>['e'],
    emitPlan: ReturnType<typeof planOf>['emitPlan'],
  ) => verifyPlan(e.plan, emitPlan, code, identify('/app/route.tsx'))

  it('passes the plan as frozen', () => {
    const { e, emitPlan } = planOf()
    expect(() => verify(e, emitPlan)).not.toThrow()
  })

  it("fails the statement's slice appended to a derived output", () => {
    const { e, emitPlan, derived } = planOf()
    emitPlan.outputs[derived]!.segments.push({ k: 'slice', ...statement })
    expect(() => verify(e, emitPlan)).toThrow('emitted 2 times (expected 1)')
  })

  it("fails the statement's slice removed from the env module", () => {
    const { e, emitPlan } = planOf()
    const env = emitPlan.outputs.env!
    env.segments = env.segments.filter(
      (s) =>
        s.k !== 'slice' || s.end <= statement.start || s.start >= statement.end,
    )
    expect(() => verify(e, emitPlan)).toThrow('emitted 0 times (expected 1)')
  })

  it('fails a text segment standing for the statement in a derived output (no gen marker)', () => {
    const { e, emitPlan, derived } = planOf()
    emitPlan.outputs[derived]!.segments.push({
      k: 'text',
      text: 'track()\n',
      mapTo: statement.start,
    })
    expect(() => verify(e, emitPlan)).toThrow('emitted 2 times (expected 1)')
  })
})
