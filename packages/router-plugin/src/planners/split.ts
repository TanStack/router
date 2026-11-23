/**
 * The split part of the router planner (SPEC J2).
 *
 * Per split option: a derived output `?tsr-split=<group>`, a generated
 * unit homed there that declares the chunk's export from the option's
 * value (claimed region) and, in the route module, a placeholder calling
 * `lazyRouteComponent` / `lazyFn` with the group's importer (written in the
 * placeholder, or one const for a group read more than once). The
 * core places everything else as route splitting on `main` does
 * (`setRouteModule`, the core's `placement.ts`). `deleteNodes` erases
 * properties in every output.
 */
import {
  DEST_INITIALIZER,
  SHAPE_FUNCTION,
  derivedIdOf,
  listEnd,
  removeListItems,
  sameFileSpecifier,
  stringLiteral,
} from '@tanstack/router-utils/compiler'
import { identifierSymbol, pascal } from './route'
import { COMPONENT_KEYS, claimedValueOf, methodPrefixOf } from './decisions'
import { ROUTER_PLANNER } from './config'
import type { SplitDecision } from './decisions'
import type { RouterRound } from './router'
import type {
  GenFrag,
  GlueImport,
  OutputId,
  PlaceFrag,
  PlanContext,
  RegionId,
  SymRef,
  SymbolId,
} from '@tanstack/router-utils/compiler'
import type { Node } from 'yuku'

/** Applies the round's split plan: `deleteNodes`, split options. */
export function planSplit(ctx: PlanContext, round: RouterRound): void {
  const { plan } = round
  const { route } = plan
  ctx.setRouteModule({
    imported: plan.imported,
    shared: plan.shared,
    route: route.routeSym,
  })

  // deleteNodes: the properties are erased in every output (J2.14), each
  // run of them with its commas (`{ server: {…}, }` erased to `{ , }` is no
  // syntax). Only the env module renders the options, but what only the
  // properties read is orphaned in every output: a declaration a chunk
  // takes leaves their reads behind too (`const { a, b = server() } = …`)
  if (
    plan.deleted.length > 0 &&
    route.options.kind === 'object' &&
    route.options.node.type === 'ObjectExpression'
  ) {
    const props = route.options.node.properties as ReadonlyArray<Node>
    const deleted = new Set<Node>()
    for (const option of plan.deleted) {
      if (plan.shadowing.has(option)) {
        // (a spread before it may hold the key: it keeps its place, or that value would win)
        ctx.rewrites.edit({
          range: { start: option.prop.start, end: option.prop.end },
          body: [
            { k: 'text', parts: [`${stringLiteral(option.key!)}: undefined`] },
          ],
          by: ROUTER_PLANNER,
        })
      } else {
        deleted.add(option.prop)
      }
    }
    removeListItems(
      ctx,
      props,
      (p) => deleted.has(p),
      deleted,
      listEnd(ctx.analysis.source.code, props),
      ROUTER_PLANNER,
    )
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
      },
    })
    if (name === 'lazyFn') {
      lazyFn = sym
    } else {
      lazyComponent = sym
    }
    return sym
  }

  // TEMPORARY WORKAROUND of web-infra-dev/rspack#16594: `chunkImporterCall`
  const importerCall = chunkImporterCall(ctx, round, helperImports)

  // a group's importer is no declaration when one placeholder reads it
  // (every group of the default groupings): the placeholder holds
  // `() => import(…)` itself, so no binding stands between the route's
  // statements for a minifier to move. A group read by several options, or
  // wrapped (`chunkImporterCall`), gets one const after the imports: it
  // separates no statements of the module there. (An arrow function
  // expression has no effect when created and nothing can name it, so
  // where it is created cannot be observed.)
  const readers = new Map<string, number>()
  for (const d of plan.decisions) {
    readers.set(d.groupKey, (readers.get(d.groupKey) ?? 0) + 1)
  }

  // one importer and one output per group
  const groups = new Map<
    string,
    { output: OutputId; importer: Array<PlaceFrag> }
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
    const derivedId = derivedIdOf(output)
    const spec = sameFileSpecifier(derivedId)
    const [open, close] = importerCall(d.groupKey)
    const importFrags: Array<PlaceFrag> = [
      { k: 'text', parts: [...open, '() => import('] },
      {
        k: 'spec',
        specifier: spec,
        edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
        form: 'dynamic',
      },
      { k: 'text', parts: [`)${close}`] },
    ]
    let importer = importFrags
    if (readers.get(d.groupKey)! > 1 || open.length > 0) {
      const named = names.alloc(
        `tsrImport${d.groupKey.split('~').map(pascal).join('')}`,
      )
      ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: [`const ${named.name} = `] },
          ...importFrags,
          { k: 'text', parts: ['\n'] },
        ],
        declares: [named.sym],
        effectful: false,
        anchor: { k: 'after-header' },
        home: 'auto',
        by: ROUTER_PLANNER,
      })
      importer = [{ k: 'text', parts: [{ sym: named.sym }] }]
    }
    g = { output, importer }
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
        : identifierSymbol(ctx, d.valueNode)
    const body: Array<GenFrag> = []
    // an identifier value is exported as it is (`export { Page as
    // component }`: no alias for the minifier to keep); a member of it,
    // an imported binding or any other value gets the chunk's own
    // declaration. (A chunk only re-exporting an import is no chunk to
    // Rollup: it resolves the lazy import to the module owning the
    // binding, often the entry, which then carries the export glue.)
    const direct = valueSym !== null && !symbols.isImport(valueSym)
    const exported: SymRef = { sym: direct ? valueSym : split.sym }
    /** The value the chunk claims (null: an identifier, read as a symbol). */
    let region: RegionId | null = null
    if (valueSym !== null) {
      // the original symbol: placement follows its declaring unit (the
      // chunk imports it when the route module keeps it); a rename renders
      // at emit time
      if (!direct) {
        body.push({
          k: 'text',
          parts: [`const ${split.name} = `, { sym: valueSym }, '\n'],
        })
      }
      ctx.addRoot(g.output, { t: 'sym', id: valueSym })
    } else {
      // the chunk claims the value and renders it whole; a method's
      // function, from its parameters on, as a function expression, and
      // the route module's property gets a key before the placeholder
      region = ctx.region(d.region, 'option-value')
      body.push({ k: 'text', parts: [`const ${split.name} = `] })
      if (d.shape === 'method') {
        ctx.rewrites.edit({
          range: d.property,
          body: [
            { k: 'text', parts: [`${d.keyText}: `] },
            { k: 'slice', range: d.region },
          ],
          by: ROUTER_PLANNER,
        })
      }
      body.push({
        k: 'region',
        id: region,
        expr:
          d.shape === 'method'
            ? {
                dest: DEST_INITIALIZER,
                shape: SHAPE_FUNCTION,
                head: methodPrefixOf(d.valueNode),
              }
            : {
                dest: DEST_INITIALIZER,
                shape: ctx.shapeOf(claimedValueOf(d.valueNode)),
              },
      })
      body.push({ k: 'text', parts: ['\n'] })
    }
    body.push({
      k: 'text',
      parts: ['export { ', exported, ` as ${d.key} }\n`],
    })
    const owner = ctx.rewrites.addGenerated({
      body,
      declares: direct ? [] : [split.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: g.output,
      by: ROUTER_PLANNER,
    })

    // the route module's placeholder (pure for the client's tree shaking;
    // a server bundle keeps every route and the comment would only cost bytes)
    const call = (prefix: string): Array<PlaceFrag> => [
      {
        k: 'text',
        parts: [
          `${prefix}${ctx.env.type === 'client' ? '/* @__PURE__ */ ' : ''}`,
          { sym: helperSym, ctx: 'callee' },
          '(',
        ],
      },
      ...g.importer,
      { k: 'text', parts: [`, ${stringLiteral(d.key)})`] },
    ]
    if (region === null) {
      ctx.rewrites.placeholder({
        range: d.region,
        body: call(d.shape === 'shorthand' ? `${d.keyText}: ` : ''),
        scope: ['env'],
        by: ROUTER_PLANNER,
      })
    } else {
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: call(''),
        by: ROUTER_PLANNER,
      })
    }
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

/**
 * TEMPORARY WORKAROUND of Rspack's lazy compilation,
 * https://github.com/web-infra-dev/rspack/issues/16594, fixed in Rspack
 * 2.3.3 (the reason and the scope: `@tanstack/solid-router`'s
 * `src/hmr-chunk-importer.ts`; remove with it once the supported Rsbuild
 * range starts at a release with that Rspack). Solid, development on the
 * client, webpack-style hosts: each group's importer is wrapped,
 * `__tsrChunkImporter(<route file>, <group>, () => import(…))`, to answer the
 * chunk's newest evaluation. Otherwise the importer stays as it is.
 * Returns what opens and closes the wrap around a group's importer.
 */
function chunkImporterCall(
  ctx: PlanContext,
  round: RouterRound,
  helperImports: Array<GlueImport>,
): (groupKey: string) => [open: Array<string | SymRef>, close: string] {
  const { cfg, route } = round
  if (!cfg.hmr || cfg.hmr.style === 'vite' || cfg.framework !== 'solid') {
    return () => [[], '']
  }
  let sym: SymbolId | null = null
  return (groupKey) => {
    if (sym === null) {
      sym = ctx.names.alloc('tsrChunkImporter').sym
      const specifier = `${route.routerPackage}/hmr`
      helperImports.push({
        names: [{ imported: '__tsrChunkImporter', local: sym }],
        spec: {
          k: 'spec',
          specifier,
          edgeKey: ctx.edgeKey(specifier, 'static', 'runtime'),
        },
      })
    }
    return [
      [
        { sym, ctx: 'callee' },
        `(${stringLiteral(ctx.identity.canonicalId, '"')}, ${stringLiteral(groupKey, '"')}, `,
      ],
      ')',
    ]
  }
}
