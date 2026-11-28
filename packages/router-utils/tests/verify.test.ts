// The output verifier (`TSR_COMPILER_VERIFY=1`, set for every test run)
// catches a planner's broken glue between the outputs of one file. Each case
// adds one broken import through a planner, the way a planner bug would emit
// it, and expects the compile to fail; a sound plan of the same module
// compiles.
import { describe, expect, it } from 'vitest'
import { sameFileSpecifier } from '../src/compiler'
import { MemoryHost, dedent, envInfo, toySplitPlanner } from './helpers'
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
    check: '(h) a declarator binding nothing the source does not have',
    error: 'keeps the initialiser of a declarator binding nothing',
    edit: (ctx) => brokenText(ctx, chunkOf(ctx), 'const {} = globalThis\n'),
  },
  {
    check: '(b) an import of a name its home output does not export',
    error: 'which does not export it',
    edit: (ctx) =>
      brokenGlue(
        ctx,
        chunkOf(ctx),
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

// (h) with a planner erasing the only reader of a `var` a nested statement
// declares: the core removes its declarator (SPEC G16); generated text
// declaring it in the env module again, the way a removal that missed the
// declarator would leave it, fails
describe('the verifier on a var only erased code read', () => {
  const path = '/app/src/route.tsx'
  const code = dedent(`
    import { secret } from './secret'
    if (true) { var hidden = secret() }
    console.log(hidden)
  `)
  const eraser = (broken: boolean): Planner => ({
    name: 'toy-eraser',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const at = code.indexOf('console.log')
      ctx.rewrites.edit({
        range: { start: at, end: code.indexOf(')', at) + 1 },
        body: [],
        by: 'toy-eraser',
      })
      if (broken) {
        brokenText(ctx, 'env', 'var hidden = 1\n')
      }
    },
  })
  const compile = (broken: boolean) =>
    new MemoryHost({ files: { [path]: code } }).compile(
      path,
      [eraser(broken)],
      {
        env: envInfo({ mode: 'build' }),
      },
    )

  it('passes the sound plan', async () => {
    const out = await compile(false)
    expect(out!.diagnostics).toEqual([])
    expect(out!.code).not.toContain('secret()')
  })

  it('fails a declaration of it in the env module', async () => {
    await expect(compile(true)).rejects.toThrow(
      'declares hidden, which only erased code read',
    )
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
