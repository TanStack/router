/**
 * `route-split` planner (SPEC J2).
 *
 * Per split option: a derived output `?tsr-split=<group>`, a generated
 * unit homed there that declares the chunk's export from the option's
 * value (claimed region) and, in the route module, a placeholder calling
 * `lazyRouteComponent` / `lazyFn` with one importer const per group. The
 * core places everything else by needers (what both sides read lives in
 * the route module and is imported by the chunk). `deleteNodes` erases
 * properties in the env output only.
 */
import {
  cleanOrphanedDeclarations,
  siblingSpecifier,
  stringLiteral,
} from '@tanstack/router-utils/compiler'
import {
  identifierSymbol,
  pascal,
  recognizeRoute,
  routeEntryDigest,
} from './route'
import { COMPONENT_KEYS, splitPlanOf } from './decisions'
import { renamedSymbol } from './round'
import type { RouteEntryFacts } from './route'
import type { SplitDecision } from './decisions'
import type { RouterPlannerConfig } from './config'
import type {
  Anchor,
  Frag,
  GateContext,
  GlueImport,
  OutputId,
  Planner,
  PrefetchContext,
  SymRef,
  SymbolId,
  Unit,
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
      // overlap), the last property of the object takes its leading comma, and
      // a run that is the whole object takes its trailing comma (`{ server:
      // {…}, }` erased to `{ , }` is a syntax error)
      if (
        plan.deleted.length > 0 &&
        route.options.kind === 'object' &&
        route.options.node.type === 'ObjectExpression'
      ) {
        const code = ctx.analysis.source.code
        const objectEnd = route.options.node.end
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
          let end = last ? props[j]!.end : props[j + 1]!.start
          if (last && i === 0) {
            let k = end
            while (k < objectEnd && /\s/.test(code[k]!)) {
              k++
            }
            if (code[k] === ',') {
              end = k + 1
            }
          }
          ctx.rewrites.add({
            range: { start, end },
            body: [],
            scope: ['env'],
            by: ROUTE_SPLIT,
            reason: 'deleteNodes',
          })
          i = j + 1
        }
        // destructured bindings only the deleted options read (G16)
        cleanOrphanedDeclarations(ctx, ['env'], ROUTE_SPLIT)
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

      // helper imports, declared once per file (one name allocator per file)
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

      // each importer right before the statement holding its group's first
      // placeholder (the options object, or an option's object declared by
      // itself): no effects between them, so a minifier inlines it there
      const firstReader = new Map<string, Unit>()
      const { regions, units } = ctx.t1
      for (const d of plan.decisions) {
        const region = regions.innermostAt(d.region.start, d.region.end)
        const unit = region === null ? null : regions.unitOf(region)
        const prev = firstReader.get(d.groupKey)
        if (
          unit !== null &&
          (!prev || units[unit]!.range.start < prev.range.start)
        ) {
          firstReader.set(d.groupKey, units[unit]!)
        }
      }
      const anchorOf = (groupKey: string): Anchor => {
        const unit = firstReader.get(groupKey)
        return unit
          ? { k: 'before-unit', unit: unit.id }
          : { k: 'after-header' }
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
        const spec = siblingSpecifier(derivedId)
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
          anchor: anchorOf(d.groupKey),
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
        // a component's binding is capitalised for the refresh runtimes; a
        // non-component option's is not, so a chunk holding only such options
        // is no React Refresh boundary and its hot updates reach its importers
        const split = names.alloc(
          COMPONENT_KEYS.includes(d.key)
            ? `TsrSplit${pascal(d.key)}`
            : `tsrSplit${pascal(d.key)}`,
        )
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
        // an identifier value is exported as it is (`export { Page as
        // component }`: no alias for the minifier to keep); a member of it
        // or any other value gets the chunk's own declaration
        const direct = valueSym !== null && d.member === null
        const exported: SymRef | string = direct
          ? { sym: valueSym }
          : split.name
        if (valueSym !== null) {
          // the original symbol: placement follows its declaring unit; a
          // rename renders at emit time. The core reports it when its
          // effects keep it in the route module (`env-declared`).
          if (!direct) {
            body.push({
              k: 'text',
              parts: [
                `const ${split.name} = `,
                { sym: valueSym },
                `.${d.member}\n`,
              ],
            })
          }
          ctx.addRoot(g.output, { t: 'sym', id: valueSym })
        } else {
          body.push({
            k: 'text',
            parts: [`const ${split.name} = ${d.methodPrefix}`],
          })
          body.push({ k: 'slice', range: d.valueRange })
          body.push({ k: 'text', parts: ['\n'] })
        }
        if (
          refreshMarkers &&
          isComponent &&
          // a foreign module's export (an imported binding or a member of
          // one) is not this module's to mark: React Refresh registers it
          // where it is declared, and the object may be frozen
          !(valueSym !== null && symbols.isImport(valueSym))
        ) {
          // identity = the module React Refresh registers the binding in
          // (where placement puts the user's component: this chunk, the
          // route module or its extracted-export module; a move is a new
          // family) + the binding: the user's component when the value names
          // one (a rename is a new family), else the chunk's own declaration
          body.push({
            k: 'text',
            parts:
              valueSym !== null
                ? [
                    exported,
                    '.$$tsrRefreshId = ',
                    { sym: valueSym, ctx: 'homeId' },
                    ` + ${stringLiteral(` ${symbols.name(renamedSymbol(ctx, valueSym))}`, '"')}\n`,
                  ]
                : [
                    exported,
                    `.$$tsrRefreshId = ${stringLiteral(`${g.derivedId} ${split.name}`, '"')}\n`,
                  ],
          })
        }
        body.push({
          k: 'text',
          parts: ['export { ', exported, ` as ${d.exportName} }\n`],
        })
        const owner = ctx.rewrites.addGenerated({
          body,
          declares: direct ? [] : [split.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: g.output,
          by: ROUTE_SPLIT,
        })

        // the route module's placeholder (pure for the client's tree shaking;
        // a server bundle keeps every route and the comment would only cost bytes)
        const call: Array<string | SymRef> = [
          ctx.env.type === 'client' ? '/* @__PURE__ */ ' : '',
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

      // every exported binding but the route may leave for an
      // extracted-export output; the core decides (a pure, unwritten
      // declaration only chunks need moves, the route module re-exports it)
      for (const e of ctx.analysis.exports) {
        if (e.kind !== 'local' || e.local === null || e.typeOnly) {
          continue
        }
        const sym = e.local
        if (sym === route.routeSym) {
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

      ctx.setFacts(ROUTE_SPLIT, facts)
    },
  }
}
