/**
 * `route-split` planner (J2; DESIGN §3.5–3.6, §3.15.1 chunk markers, R42).
 *
 * Per split option: a derived output `?tsr-split=<group>`, a generated
 * unit homed there that declares the chunk's export from the option's
 * value (claimed region) and, in the route module, a placeholder calling
 * `lazyRouteComponent` / `lazyFn` with one importer const per group. The
 * core places everything else by needers (what both sides read lives in
 * the route module and is imported by the chunk). `deleteNodes` erases
 * properties in the env output only; route CSS moves into the chunks when
 * every component option is split (R42).
 */
import { stringLiteral } from '@tanstack/router-utils/compiler'
import {
  identifierSymbol,
  pascal,
  recognizeRoute,
  routeEntryDigest,
  routerRouteId,
} from './route'
import { COMPONENT_KEYS, splitPlanOf } from './decisions'
import { renamedSymbol } from './round'
import type { RouteEntryFacts } from './route'
import type { SplitDecision } from './decisions'
import type { RouterPlannerConfig } from './config'
import type {
  Frag,
  GateContext,
  GlueImport,
  OutputId,
  Planner,
  PrefetchContext,
  SymRef,
  SymbolId,
} from '@tanstack/router-utils/compiler'

export const ROUTE_SPLIT = 'route-split'
export const ROUTE_HMR = 'route-hmr'

/** Host services the router planners read (`HostServices.services.routes`). */
export interface RouteRegistryService {
  lookup: (path: string) => RouteEntryFacts | null
}

export function routeRegistryOf(
  ctx: PrefetchContext,
): RouteRegistryService | null {
  const services = ctx.host.services as
    | { routes?: RouteRegistryService }
    | undefined
  return services?.routes ?? null
}

/** Phase A of both router planners: the registry entry, recorded as a dependency. */
export function prefetchRouteEntry(
  _t0: unknown,
  ctx: PrefetchContext,
): Promise<void> {
  const registry = routeRegistryOf(ctx)
  const entry = registry?.lookup(ctx.identity.path) ?? null
  ctx.ledger.record({
    kind: 'route-registry',
    path: ctx.identity.path,
    digest: routeEntryDigest(entry),
  })
  ctx.set(entry)
  return Promise.resolve()
}

export function routeGate(
  t0: { exports: ReadonlyArray<{ kind: string; name?: string }> },
  _ctx: GateContext,
): boolean {
  return t0.exports.some((e) => e.kind === 'local' && e.name === 'Route')
}

function configOf(ctx: { config: unknown }): RouterPlannerConfig {
  return ctx.config as RouterPlannerConfig
}

export interface SplitFacts {
  routeId: string | null
  groups: Record<string, Array<string>>
  notSplit: Array<{ key: string; reason: string }>
  deleted: Array<string>
  /** Export name of each split option in its chunk, by option key. */
  chunkExports: Record<string, string>
}

export function routeSplitPlanner(): Planner {
  return {
    name: ROUTE_SPLIT,
    tier: 1,
    gate: (t0, ctx) => {
      const cfg = configOf(ctx)
      if (!cfg.split && cfg.deleteNodes.length === 0) {
        return false
      }
      return routeGate(t0, ctx)
    },
    prefetch: prefetchRouteEntry,
    plan(ctx) {
      const cfg = configOf(ctx)
      const plan = splitPlanOf(ctx, cfg)
      if (!plan) {
        // no recognised route: report what recognition found (J2.10, J2.11)
        for (const w of recognizeRoute(ctx).warnings) {
          ctx.diagnostic(w)
        }
        return
      }
      const { route } = plan
      ctx.setRouteModule()
      ctx.markBenignEffect(route.routeUnit.id)
      for (const w of plan.warnings) {
        ctx.diagnostic(w)
      }

      // deleteNodes: the properties are erased in the env output only (J2.14);
      // consecutive deleted properties form one edit (their comma ranges
      // overlap), and the last property of the object takes its leading comma
      if (
        plan.deleted.length > 0 &&
        route.options.kind === 'object' &&
        route.options.node.type === 'ObjectExpression'
      ) {
        const props = route.options.node.properties as Array<{
          start: number
          end: number
        }>
        const deleted = new Set(plan.deleted.map((d) => d.prop))
        let i = 0
        while (i < props.length) {
          if (!deleted.has(props[i] as never)) {
            i++
            continue
          }
          let j = i
          while (j + 1 < props.length && deleted.has(props[j + 1] as never)) {
            j++
          }
          const last = j === props.length - 1
          const start = last && i > 0 ? props[i - 1]!.end : props[i]!.start
          const end = last ? props[j]!.end : props[j + 1]!.start
          ctx.rewrites.add({
            range: { start, end },
            body: [],
            scope: ['env'],
            by: ROUTE_SPLIT,
            reason: 'deleteNodes',
          })
          i = j + 1
        }
      }

      const facts: SplitFacts = {
        routeId: route.routeId,
        groups: {},
        notSplit: plan.notSplit.map((n) => ({ key: n.key, reason: n.reason })),
        deleted: plan.deleted.map((d) => d.key ?? '...'),
        chunkExports: {},
      }
      if (plan.decisions.length === 0) {
        ctx.setFacts(ROUTE_SPLIT, facts)
        return
      }

      const { names, symbols } = ctx
      const refreshMarkers =
        cfg.hmr.enabled &&
        cfg.framework === 'react' &&
        ctx.env.mode === 'dev' &&
        ctx.env.type === 'client'

      // helper imports, declared once per file (D10)
      let lazyComponent: SymbolId | null = null
      let lazyFn: SymbolId | null = null
      const helperImports: Array<GlueImport> = []
      const helper = (name: 'lazyRouteComponent' | 'lazyFn'): SymbolId => {
        const existing = name === 'lazyFn' ? lazyFn : lazyComponent
        if (existing !== null) {
          return existing
        }
        const sym = names.alloc(name).sym
        helperImports.push({
          names: [{ imported: name, local: sym }],
          spec: {
            k: 'spec',
            specifier: route.routerPackage,
            edgeKey: ctx.edgeKey(route.routerPackage, 'static', 'runtime'),
            provenance: { origin: 'runtime' },
          },
        })
        if (name === 'lazyFn') {
          lazyFn = sym
        } else {
          lazyComponent = sym
        }
        return sym
      }

      // one importer const and one output per group
      const groups = new Map<
        string,
        { output: OutputId; derivedId: string; importer: SymbolId }
      >()
      const groupOf = (d: SplitDecision) => {
        let g = groups.get(d.groupKey)
        if (g) {
          return g
        }
        const output = ctx.declareOutput({
          kind: 'split',
          key: d.groupKey,
          derived: { kind: 'split', value: d.groupKey },
        })
        const derivedId = output.slice('derived:'.length)
        const importer = names.alloc(
          `tsrImport${d.groupKey.split('~').map(pascal).join('')}`,
        )
        const spec = siblingSpecifierOf(derivedId)
        ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${importer.name} = () => import(`] },
            {
              k: 'spec',
              specifier: spec,
              edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
              provenance: { origin: 'runtime' },
              form: 'dynamic',
            },
            { k: 'text', parts: [')\n'] },
          ],
          declares: [importer.sym],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: ROUTE_SPLIT,
        })
        g = { output, derivedId, importer: importer.sym }
        groups.set(d.groupKey, g)
        facts.groups[d.groupKey] = [...d.group]
        return g
      }

      for (const d of plan.decisions) {
        const g = groupOf(d)
        const isComponent = d.key !== 'loader'
        const helperSym = helper(isComponent ? 'lazyRouteComponent' : 'lazyFn')
        const split = names.alloc(`TsrSplit${pascal(d.key)}`)
        facts.chunkExports[d.key] = d.exportName

        // the chunk's unit: declares the export from the option's value. An
        // identifier value is read as a symbol (the binding travels by
        // placement; a renamed one renders its new name) and its occurrence
        // is replaced in the env output only; any other value is claimed by
        // the chunk unit and a placeholder renders at its occurrence.
        const valueSym =
          d.shape === 'shorthand'
            ? d.shorthandSym
            : d.shape === 'init'
              ? identifierSymbol(ctx, d.valueNode)
              : null
        const body: Array<Frag> = []
        if (valueSym !== null) {
          // the original symbol: placement follows its declaring unit; a
          // rename renders at emit time. The core reports it when its
          // effects keep it in the route module (`env-declared`).
          body.push({
            k: 'text',
            parts: [
              `const ${split.name} = `,
              { sym: valueSym },
              d.member ? `.${d.member}\n` : '\n',
            ],
          })
          ctx.addRoot(g.output, { t: 'sym', id: valueSym })
        } else {
          body.push({
            k: 'text',
            parts: [`const ${split.name} = ${d.methodPrefix}`],
          })
          body.push({ k: 'slice', range: d.valueRange })
          body.push({ k: 'text', parts: ['\n'] })
        }
        if (refreshMarkers && isComponent) {
          // identity = chunk id + the binding React Refresh registers: the
          // user's component when the value names one (a rename is a new
          // family), else the chunk's own declaration
          const registered =
            valueSym !== null
              ? symbols.name(renamedSymbol(ctx, valueSym))
              : split.name
          body.push({
            k: 'text',
            parts: [
              `${split.name}.$$tsrRefreshId = ${stringLiteral(`${g.derivedId} ${registered}`, '"')}\n`,
            ],
          })
        }
        body.push({
          k: 'text',
          parts: [`export { ${split.name} as ${d.exportName} }\n`],
        })
        const owner = ctx.rewrites.addGenerated({
          body,
          declares: [split.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: g.output,
          by: ROUTE_SPLIT,
        })

        // the route module's placeholder
        const call: Array<string | SymRef> = [
          '/* @__PURE__ */ ',
          { sym: helperSym, ctx: 'callee' },
          '(',
          { sym: g.importer },
          `, ${stringLiteral(d.exportName)})`,
        ]
        const placeholder: Array<Frag> = [
          {
            k: 'text',
            parts: d.wholeProperty ? [`${d.keyText}: `, ...call] : call,
          },
        ]
        if (valueSym !== null) {
          ctx.rewrites.add({
            range: d.region,
            body: placeholder,
            scope: ['env'],
            by: ROUTE_SPLIT,
            reason: 'split',
          })
        } else {
          const region = ctx.region(d.region, 'option-value')
          ctx.rewrites.claim({ region, owner, placeholder, by: ROUTE_SPLIT })
        }
      }

      // §3.5.3: every exported pure, unwritten declaration may leave for an
      // extracted-export output; the core keeps it in the route module when
      // other route-module code reads it or no chunk needs it
      for (const e of ctx.analysis.exports) {
        if (e.kind !== 'local' || e.local === null || e.typeOnly) {
          continue
        }
        const sym = e.local
        if (sym === route.routeSym) {
          continue
        }
        const declaring = ctx.t1.declaringUnits.get(sym) ?? []
        if (
          declaring.length === 0 ||
          declaring.some((u) => ctx.t1.units[u]!.kind !== 'declaration') ||
          declaring.some((u) => ctx.t1.units[u]!.effectful) ||
          ctx.t1.refs.writesOf(sym).length > 0
        ) {
          continue
        }
        const name = symbols.name(renamedSymbol(ctx, sym))
        const output = ctx.declareOutput({
          kind: 'export',
          key: `export~${name}`,
          derived: { kind: 'export', value: name },
          sideEffectFree: true,
        })
        ctx.extract(sym, output)
      }

      if (helperImports.length > 0) {
        ctx.rewrites.addGenerated({
          body: [],
          declares: [],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: ROUTE_SPLIT,
          imports: helperImports,
        })
      }

      // R42: route CSS moves into the component chunks when every component option is split
      const componentOptions = [...plan.componentOptions.values()]
      const componentDecisions = componentOptions.filter(
        (d): d is SplitDecision => d !== null,
      )
      if (
        componentDecisions.length > 0 &&
        componentDecisions.length === componentOptions.length
      ) {
        const chunkOutputs = new Set<OutputId>()
        for (const d of componentDecisions) {
          if (COMPONENT_KEYS.includes(d.key)) {
            chunkOutputs.add(groups.get(d.groupKey)!.output)
          }
        }
        for (const unit of ctx.t1.units) {
          if (unit.kind !== 'import-effect' || !unit.isStyleImport) {
            continue
          }
          const imp =
            unit.importIndex !== null
              ? ctx.analysis.imports[unit.importIndex]
              : undefined
          if (!imp) {
            continue
          }
          const item = ctx.t1.items[unit.item]!
          ctx.rewrites.add({
            range: item.range,
            body: [],
            scope: ['env'],
            by: ROUTE_SPLIT,
            reason: 'route-css',
          })
          for (const output of chunkOutputs) {
            ctx.rewrites.addGenerated({
              body: [
                { k: 'text', parts: ['import '] },
                {
                  k: 'spec',
                  specifier: imp.specifier,
                  edgeKey: ctx.edgeKey(imp.specifier, 'bare'),
                  provenance: {
                    origin: 'forwarded',
                    importerId: ctx.identity.canonicalId,
                    span: imp.specifierRange,
                    rawSpecifier: imp.specifier,
                  },
                },
                { k: 'text', parts: ['\n'] },
              ],
              declares: [],
              effectful: true,
              anchor: { k: 'after-header' },
              home: output,
              by: ROUTE_SPLIT,
            })
          }
        }
      }

      ctx.setFacts(ROUTE_SPLIT, facts)
    },
  }
}

/** `./<basename>?<query>` of a derived id (same directory as the route module). */
function siblingSpecifierOf(targetId: string): string {
  const hashAt = targetId.indexOf('#')
  const noHash = hashAt === -1 ? targetId : targetId.slice(0, hashAt)
  const q = noHash.indexOf('?')
  const base = q === -1 ? noHash : noHash.slice(0, q)
  const query = q === -1 ? '' : noHash.slice(q)
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  const basename = slash === -1 ? base : base.slice(slash + 1)
  return `./${basename}${query}`
}

export { routerRouteId }
