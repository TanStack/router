/** Direct engine harness: parse → AnalysisPlan → planners-as-callbacks → freeze → emit. */
import {
  AnalysisPlan,
  ModuleAnalysis,
  emitRecipe,
  identify,
  parseModule,
  revision,
} from '../src/compiler'
import { envInfo } from './helpers'
import type { EmitPlan, EnvInfo, OutputId, PlanContext } from '../src/compiler'

export interface Engine {
  plan: AnalysisPlan
  ctx: PlanContext
  freeze: () => EmitPlan
  render: (
    output?: OutputId,
    wantMap?: boolean,
  ) => { code: string; map: unknown }
  code: string
}

export function engine(
  code: string,
  opts: {
    id?: string
    env?: Partial<EnvInfo>
    fallbacks?: PlanContext['fallbacks']
  } = {},
): Engine {
  const id = opts.id ?? '/app/route.tsx'
  const identity = identify(id)
  const parsed = parseModule(code, {
    lang: identity.lang ?? 'tsx',
    path: identity.path,
  })
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((d) => d.message).join('\n'))
  }
  const analysis = new ModuleAnalysis(parsed.file, parsed.source, {
    path: identity.path,
  })
  const env = envInfo(opts.env)
  const plan = new AnalysisPlan(
    analysis,
    identity,
    env,
    new Map(),
    opts.fallbacks ?? [],
  )
  let frozen: EmitPlan | null = null
  const freeze = () => {
    if (!frozen) {
      frozen = plan.freeze(revision(code))
    }
    return frozen
  }
  return {
    plan,
    ctx: plan,
    code,
    freeze,
    render(output = 'env', wantMap = false) {
      const p = freeze()
      const recipe = p.outputs[output]
      if (!recipe) {
        return { code: 'export {}\n', map: null }
      }
      return emitRecipe(recipe, analysis.source, wantMap)
    },
  }
}

export function rangeOf(
  code: string,
  needle: string,
  nth = 0,
): { start: number; end: number } {
  let idx = -1
  for (let i = 0; i <= nth; i++) {
    idx = code.indexOf(needle, idx + 1)
    if (idx === -1) {
      throw new Error(`needle not found: ${needle}`)
    }
  }
  return { start: idx, end: idx + needle.length }
}
