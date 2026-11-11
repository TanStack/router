/**
 * The router planner's readings for the executing placement property
 * (router-utils `tests/placement-exec/property.ts`, REVIEW-design2-final):
 * React, Solid and Vue, client and server, four split groupings, compiled
 * in process on the public compiler API. The unit tier runs a fixed seed
 * range (`placement-exec.test.ts`), the slow tier a larger one
 * (`integration/placement-exec.test.ts`).
 */
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import { routerPlanner } from '../src/planners/router'
import { ROUTER_PLANNER, routerPlannerConfigFrom } from '../src/planners/config'
import {
  LIB_TS,
  collect,
} from '../../router-utils/tests/placement-exec/property'
import type { Config } from '../../router-utils/tests/placement-exec/property'
import type {
  CompilerCaches,
  HostServices,
  RouteRegistry,
} from '@tanstack/router-utils/compiler'
import type { CodeSplitGroupings } from '../src/core/constants'

export {
  disagreements,
  seedRange,
} from '../../router-utils/tests/placement-exec/property'

/** One compile's files, resolving `./lib` next to the route. */
class Host implements HostServices {
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly routes: RouteRegistry = {
    lookup: () => ({ routeId: '/x', routerConstructor: true }),
    digestFor: () => 'd',
  }
  constructor(private readonly files: Record<string, string>) {
    this.rawFacts = new RawFactsCache({
      readFile: (p) => this.readFile(p),
      loadVirtual: () => Promise.resolve(null),
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }
  resolve(specifier: string, importer: string) {
    const dir = importer.split('?')[0]!.replace(/\/[^/]*$/, '')
    const id = `${dir}/${specifier.replace(/^\.\//, '')}.ts`
    return Promise.resolve(
      specifier.startsWith('./') && id in this.files ? { id } : null,
    )
  }
  readFile(p: string) {
    return Promise.resolve(this.files[p] ?? null)
  }
  loadVirtual() {
    return Promise.resolve(null)
  }
}

const file = '/app/src/routes/x.tsx'
const groupings: Array<[string, CodeSplitGroupings | undefined]> = [
  ['default', undefined],
  ['l|c', [['loader'], ['component']]],
  ['l|ce', [['loader'], ['component', 'errorComponent']]],
  [
    'l|c|e|n',
    [['loader'], ['component'], ['errorComponent'], ['notFoundComponent']],
  ],
]

export const routerConfigs: Array<Config> = (
  ['react', 'solid', 'vue'] as const
).flatMap((framework) =>
  (['client', 'server'] as const).flatMap((envType) =>
    groupings.map(
      ([label, defaultBehavior]): Config => ({
        label: `${framework} ${envType} ${label}`,
        router: `@tanstack/${framework}-router`,
        file,
        compile: async (code, mode) => {
          const host = new Host({
            [file]: code,
            '/app/src/routes/lib.ts': LIB_TS,
          })
          const router = routerPlannerConfigFrom(
            defaultBehavior === undefined ? undefined : { defaultBehavior },
            {
              framework,
              envType,
              mode,
              hmrStyle: 'vite',
              start: false,
              autoCodeSplitting: true,
            },
          )
          const outputs = await collect(file, (id) =>
            compileModule(
              {
                id,
                code,
                env: {
                  name: envType === 'client' ? 'client' : 'ssr',
                  type: envType,
                  mode,
                },
                planners: [routerPlanner()],
                config: {
                  configKey: 'cfg',
                  perPlanner: { [ROUTER_PLANNER]: router },
                },
                wantMap: false,
              },
              host,
              host.caches,
            ),
          )
          // a throwaway host per compile: what its compiles left stale has no
          // later compile to take it (the per-file stale-path check)
          for (const env of host.caches.plans.keys()) {
            host.caches.stale.take(env, { held: true })
          }
          return outputs
        },
      }),
    ),
  ),
)
