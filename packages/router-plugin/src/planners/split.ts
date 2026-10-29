/**
 * The split part of the router planner (SPEC J2).
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
import { identifierSymbol, pascal } from './route'
import { COMPONENT_KEYS } from './decisions'
import { ROUTER_PLANNER } from './config'
import type { SplitDecision } from './decisions'
import type { RouterRound } from './router'
import type {
  Anchor,
  Frag,
  GlueImport,
  OutputId,
  PlanContext,
  SymRef,
  SymbolId,
  Unit,
} from '@tanstack/router-utils/compiler'

/** Applies the round's split plan: `deleteNodes`, split options, extracted exports. */
export function planSplit(ctx: PlanContext, round: RouterRound): void {
  const { plan } = round
  const { route } = plan
  ctx.setRouteModule()
  ctx.describeModule({ name: 'route module', tag: '[tanstack-router]' })
  ctx.markBenignEffect(route.routeUnit.id)

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
        by: ROUTER_PLANNER,
      })
      i = j + 1
    }
    // destructured bindings only the deleted options read (G16)
    cleanOrphanedDeclarations(ctx, ['env'], ROUTER_PLANNER)
  }

  if (plan.decisions.length === 0) {
    return
  }

  const { names, symbols } = ctx

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
    return unit ? { k: 'before-unit', unit: unit.id } : { k: 'after-header' }
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
      by: ROUTER_PLANNER,
    })
    g = { output, derivedId, importer: importer.sym }
    groups.set(d.groupKey, g)
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
    // component }`: no alias for the minifier to keep); a member of it,
    // an imported binding or any other value gets the chunk's own
    // declaration. (A chunk only re-exporting an import is no chunk to
    // Rollup: it resolves the lazy import to the module owning the
    // binding, often the entry, which then carries the export glue.)
    const direct =
      valueSym !== null && d.member === null && !symbols.isImport(valueSym)
    const exported: SymRef = { sym: direct ? valueSym : split.sym }
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
            d.member === null ? '\n' : `.${d.member}\n`,
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
      by: ROUTER_PLANNER,
    })
    if (isComponent) {
      round.splitComponents.push({ output: g.output, exported, valueSym })
    }

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
        by: ROUTER_PLANNER,
      })
    } else {
      const region = ctx.region(d.region, 'option-value')
      ctx.rewrites.claim({ region, owner, placeholder, by: ROUTER_PLANNER })
    }
  }

  // every exported binding but the route may leave for an
  // extracted-export output; the core decides (a pure, unwritten
  // declaration only chunks need moves, the route module re-exports it,
  // chunks copy it; in dev it stays in the route module: `reach.ts`)
  for (const e of ctx.analysis.exports) {
    if (e.kind !== 'local' || e.local === null || e.typeOnly) {
      continue
    }
    const sym = e.local
    if (sym === route.routeSym) {
      // the route stays, whatever another planner offered (Hydrate
      // offers every export): its chunks import it, and that is no
      // kept export to report
      ctx.keep(sym)
      continue
    }
    const name = ctx.nameOf(sym)
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
      by: ROUTER_PLANNER,
      imports: helperImports,
    })
  }
}
