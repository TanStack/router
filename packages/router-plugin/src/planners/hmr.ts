/**
 * The route HMR part of the router planner (SPEC J3; the runtime side is
 * `hmr.ts` of router-core and the framework routers), in a development
 * client only.
 *
 * Before the split part (`planHmrHoists`): for React, every component option
 * that stays in the route module and that React Refresh can register
 * becomes a registrable binding — inline functions and higher-order calls
 * are hoisted into `const Tsr<Key> = …` before the statement holding the
 * options (a claim, so the original body is relocated, not reprinted; a
 * hoisted call runs before the rest of the statement: KNOWN-BUGS),
 * lowercase module-level components are renamed module-wide (the runtime
 * takes the new component after React Refresh's pass; a family is what
 * keeps its state). Solid and Vue need nothing: their refresh runtimes'
 * values say what they patch (the adapters' `keep`).
 * A lazy route file (`createLazyFileRoute`, never split) gets both; its
 * options are the ones the route loads with its chunk (`lazy: true` in the
 * block's meta).
 * After it (`planHmrBlock`): the dev block, with the literal
 * `import.meta.hot.accept(` (Vite) / `import.meta.webpackHot.accept()`, the
 * `__tsrRouteHmr(routeId, Route, meta)` call that runs on every evaluation,
 * and, for React on Vite, the refresh anchor export; on webpack-style hosts,
 * the chunk blocks (`chunkHmr`, `keptReaderHmr`).
 */
import {
  DEST_INITIALIZER,
  SHAPE_FUNCTION,
  stringLiteral,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import {
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  pascal,
  refreshRegisters,
  routerRouteId,
} from './route'
import { COMPONENT_KEYS, methodPrefixOf, ownThisOf } from './decisions'
import { ROUTER_PLANNER } from './config'
import type { HmrStyle } from './config'
import type { RouterRound } from './router'
import type {
  GenFrag,
  PlanContext,
  SymRef,
  SymbolId,
  Unit,
} from '@tanstack/router-utils/compiler'
import type { Comment } from 'yuku'

/** The component options route HMR keeps: the splittable ones and `shellComponent`. */
const HMR_COMPONENT_KEYS: ReadonlyArray<string> = [
  ...COMPONENT_KEYS,
  'shellComponent',
]

function isCapitalised(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90
}

/**
 * Before the split part: React, makes every component option that stays in
 * the route module a binding React Refresh registers where it can.
 */
export function planHmrHoists(ctx: PlanContext, round: RouterRound): void {
  const { cfg, route, plan } = round
  if (cfg.framework !== 'react' || route.options.kind !== 'object') {
    return
  }
  const split = new Set(plan.decisions.map((d) => d.key))
  // a deleted option is no component of the route (its removal may span the
  // region a hoist would claim)
  const deleted = new Set(plan.deleted.map((d) => d.key))
  // the split option values that name a binding: the splitter's own
  // edit replaces those occurrences (a ref edit there would collide)
  const splitRegions = plan.decisions
    .filter(
      (d) =>
        d.shape === 'shorthand' || identifierSymbol(ctx, d.valueNode) !== null,
    )
    .map((d) => d.region)
  const { names, symbols } = ctx
  for (const option of route.props) {
    if (
      option.key === null ||
      !HMR_COMPONENT_KEYS.includes(option.key) ||
      deleted.has(option.key) ||
      option.value === null ||
      option.kind === 'spread' ||
      option.kind === 'computed' ||
      option.kind === 'accessor'
    ) {
      continue
    }
    const key = option.key
    const value = option.value
    const isSplit = split.has(key)
    if (
      option.kind !== 'method' &&
      (isFallbackLiteral(unwrapExpression(value)) ||
        isAlreadyLazy(ctx, round.route.routerPackage, value))
    ) {
      continue
    }
    const sym = option.kind === 'method' ? null : identifierSymbol(ctx, value)
    if (sym !== null) {
      // a module binding: registrable by its own declaration when
      // capitalised; a lowercase local one is renamed module-wide, split
      // or not (React Refresh registers it wherever it is declared); an
      // import is registered by its module, under its export's name
      const name = symbols.name(sym)
      if (
        isCapitalised(name) ||
        symbols.isImport(sym) ||
        ctx.nameOf(sym) !== name
      ) {
        continue
      }
      const units = ctx.t1.declaringUnits.get(sym) ?? []
      const local = units.some((u) => ctx.t1.units[u]!.kind === 'declaration')
      if (!local) {
        continue
      }
      const next = names.alloc(`Tsr${pascal(key)}`)
      // the occurrences that are split option values are the splitter's
      // (its edit replaces them; the chunk reads the renamed symbol)
      ctx.renameRefs(sym, { sym: next.sym }, ROUTER_PLANNER, splitRegions)
      continue
    }
    if (
      isSplit ||
      (option.kind !== 'method' && !refreshRegisters(value)) ||
      // (a method using its own `this` or `super` stays a method: as a
      // function expression its `super` is a syntax error, #8688)
      (option.kind === 'method' && ownThisOf(ctx, value) !== null) ||
      // (a hoisted call runs before the whole statement: past an earlier
      // declarator of it, it may read a binding not yet initialised)
      (unwrapExpression(value).type === 'CallExpression' &&
        afterEarlierDeclarator(ctx, route.optionsUnit))
    ) {
      // (a value React Refresh registers no family for stays inline: an
      // edit remounts it)
      continue
    }
    // inline value or method: hoist into a registrable binding before the options
    const hoisted = names.alloc(`Tsr${pascal(key)}`)
    // the hoist claims the bare value (React Refresh registers a bare
    // function) and renders it whole: a cast around it stays in place,
    // around the placeholder (`TsrComponent as any`), and so does a method's
    // key, which the property's edit writes before the placeholder
    const method = option.kind === 'method'
    const inner = method ? value : unwrapExpression(value)
    const range = { start: inner.start, end: inner.end }
    const region = ctx.region(range, 'option-value')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: [`const ${hoisted.name} = `] },
        {
          k: 'region',
          id: region,
          expr: method
            ? {
                dest: DEST_INITIALIZER,
                shape: SHAPE_FUNCTION,
                head: methodPrefixOf(value),
              }
            : { dest: DEST_INITIALIZER, shape: ctx.shapeOf(inner) },
        },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: route.optionsUnit.id },
      home: 'auto',
      by: ROUTER_PLANNER,
    })
    if (method) {
      ctx.rewrites.edit({
        range: { start: option.prop.start, end: option.prop.end },
        body: [
          { k: 'text', parts: [`${option.keyText}: `] },
          { k: 'slice', range },
        ],
        by: ROUTER_PLANNER,
      })
    }
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: ROUTER_PLANNER,
    })
  }
}

/**
 * Whether the declarator `unit` holds follows another declarator of its
 * declaration (`const a = …, Route = …`): a hoist lands before the whole
 * declaration.
 */
function afterEarlierDeclarator(ctx: PlanContext, unit: Unit): boolean {
  const declaration = ctx.analysis.file.parentOf(unit.node)
  return (
    declaration?.type === 'VariableDeclaration' &&
    declaration.declarations[0] !== unit.node
  )
}

/**
 * After the split part: the dev block of the route module and, on
 * webpack-style hosts, of its split chunks holding a non-component option
 * (Solid: of every split chunk).
 */
export function planHmrBlock(
  ctx: PlanContext,
  round: RouterRound,
  style: HmrStyle,
): void {
  const { cfg, route } = round
  // options the compiler can't read may be one object shared across
  // evaluations, which the route adopts: a second evaluation can't take it, so
  // an edit reloads the page (J2.8)
  if (route.options.kind === 'opaque') {
    return
  }
  const { names } = ctx
  const hmr = names.alloc('tsrHmr')
  const vite = style === 'vite'
  const reactVite = vite && cfg.framework === 'react'
  const anchor = reactVite ? names.alloc('TsrFastRefreshAnchor') : null
  // the route file is the runtime's key for what it holds of this module
  const file = stringLiteral(ctx.identity.canonicalId, '"')
  const metaParts: Array<string> = [`file: ${file}`]
  // a lazy route file's `Route` holds the options the route loads with its
  // chunk: the runtime applies them to the route of its id
  if (route.kind === 'lazy') {
    metaParts.push('lazy: true')
  }
  if (vite && cfg.framework !== 'react') {
    // Solid's and Vue's refresh patch components in the update's accept
    // callbacks: the runtime waits for Vite to have run them
    metaParts.push('hot: import.meta.hot')
  }
  if (cfg.framework === 'solid' && route.kind !== 'lazy') {
    // the module each component option lives in (its split chunk, or the
    // route module): solid-refresh cannot follow a component to another
    // module, so the runtime reloads when one moves
    const chunkOf = new Map(
      round.plan.decisions.map((d) => [d.key, d.groupKey]),
    )
    const chunks = route.props
      .filter((o) => o.key !== null && COMPONENT_KEYS.includes(o.key))
      .map((o) => `${o.key}:${chunkOf.get(o.key!) ?? ''}`)
      .sort()
      .join(',')
    metaParts.push(`chunks: ${stringLiteral(chunks, '"')}`)
  }
  const hot = vite ? 'import.meta.hot' : 'import.meta.webpackHot'
  // the dev-only runtime lives on its own subpath: production never loads it
  const hmrSpecifier = `${route.routerPackage}/hmr`
  const call: Array<string | SymRef> = [
    `if (${hot}) {\n  ${hot}.accept()\n  `,
    { sym: hmr.sym, ctx: 'callee' },
    `(${stringLiteral(routerRouteId(route.routeId), '"')}, `,
    { sym: route.routeSym },
    `, { ${metaParts.join(', ')}`,
  ]
  const body: Array<GenFrag> = []
  if (anchor) {
    // the exports plugin-react ignores: the route, the anchor and
    // (over-approximated) every module-level binding the core may export as
    // glue for the chunks, by its name and by its glue name (`x$1` when `x`
    // is an export's name, `tsr$x` next to `export *`, never `x` there), but
    // no other export of the user's, a name `export *` may re-export
    // included: plugin-react validates those, so a component updates in
    // place and an edited value invalidates the module for its importers (a
    // reload, as on main)
    const exportNames = new Set<string>()
    const userExports = new Set<string>()
    let star = false
    for (const e of ctx.analysis.exports) {
      if (e.kind === 'star') {
        star ||= !e.typeOnly
        continue
      }
      if (e.kind === 'local' && e.local === route.routeSym) {
        exportNames.add(e.name)
      } else if (e.kind !== 'local' || !e.typeOnly) {
        userExports.add(e.name)
      }
    }
    const { symbols } = ctx.t1
    for (let i = 0; i < symbols.size; i++) {
      const sym = i as SymbolId
      if (!symbols.isModuleLevel(sym)) {
        continue
      }
      const name = symbols.name(sym)
      if (!star && !userExports.has(name)) {
        exportNames.add(name)
      }
      // a glue name is another name (free of the module's exports) only
      // next to `export *` or when an export takes the binding's name
      if (
        sym !== route.routeSym &&
        (star || !ctx.names.isExportNameFree(name))
      ) {
        exportNames.add(ctx.glueExportName(sym))
      }
    }
    exportNames.add(anchor.name)
    call.push(
      `, refreshExports: { anchor: ${stringLiteral(anchor.name, '"')}, exports: [${[...exportNames].map((n) => stringLiteral(n, '"')).join(', ')}`,
    )
    body.push({
      k: 'text',
      parts: [
        ...call,
        `] } })\n}\nexport function ${anchor.name}() { return null }\n`,
      ],
    })
  } else {
    body.push({ k: 'text', parts: [...call, ' })\n}\n'] })
  }
  ctx.rewrites.addGenerated({
    body,
    declares: anchor ? [anchor.sym] : [],
    effectful: true,
    anchor: { k: 'end' },
    home: 'auto',
    by: ROUTER_PLANNER,
    imports: [
      {
        names: [{ imported: '__tsrRouteHmr', local: hmr.sym }],
        spec: {
          k: 'spec',
          specifier: hmrSpecifier,
          edgeKey: ctx.edgeKey(hmrSpecifier, 'static', 'runtime'),
        },
      },
    ],
  })
  const groups = splitGroups(round)
  refreshStatements(ctx, groups)
  if (!vite) {
    chunkHmr(ctx, round, groups)
    keptReaderHmr(ctx, round)
  }
}

/** Per split group (its key): whether it holds a component option, and a non-component one. */
type SplitGroups = Map<string, { component: boolean; nonComponent: boolean }>

function splitGroups(round: RouterRound): SplitGroups {
  const groups: SplitGroups = new Map()
  for (const d of round.plan.decisions) {
    let g = groups.get(d.groupKey)
    if (!g) {
      g = { component: false, nonComponent: false }
      groups.set(d.groupKey, g)
    }
    if (HMR_COMPONENT_KEYS.includes(d.key)) {
      g.component = true
    } else {
      g.nonComponent = true
    }
  }
  return groups
}

/**
 * The refresh plugins (React Refresh, solid-refresh) read `@refresh` in a
 * module's comments, each by a rule of its own (any comment, a comment
 * leading its line, none in syntax TypeScript erases). In development, a
 * split chunk holding components therefore holds the file's `@refresh`
 * comments (SPEC J2.16), without a statement running twice or a binding
 * becoming two:
 *
 * - a statement TypeScript erases is in the chunk too, as written, in its
 *   place (it runs nowhere), an `import type` included (not an import with
 *   inline `type` specifiers, which `verbatimModuleSyntax` keeps);
 * - any other statement is where the core puts it, and its comments are
 *   also copied alone, as written, after the chunk's imports: on a line of
 *   their own when they lead their line in the file or only comments follow
 *   them, after a `;` otherwise (which of the two is the one distinction a
 *   refresh plugin makes that a copy can change);
 * - but not the comments inside an import or a statement that is only an
 *   expression, nor a comment that also holds a JSX pragma: those stay
 *   where they mean what they mean in the file.
 */
function refreshStatements(ctx: PlanContext, groups: SplitGroups): void {
  const { file } = ctx.analysis
  // (most route files have none: no comment list is read for them)
  if (!file.source.includes('@refresh')) {
    return
  }
  const { items, units } = ctx.t1
  const bounds: CommentBounds = { byEnd: new Map(), byStart: new Map() }
  for (const c of file.comments) {
    bounds.byEnd.set(c.end, c.start)
    bounds.byStart.set(c.start, c.end)
  }
  const erased = new Set<Unit['id']>()
  const copies: Array<string> = []
  for (const comment of file.comments) {
    if (!comment.value.includes('@refresh')) {
      continue
    }
    const item = items.find(
      (i) => i.range.start <= comment.start && comment.end <= i.range.end,
    )
    if (
      item &&
      // (an import of types only is erased under every setting; one with
      // inline `type` specifiers, which no output renders, is kept under
      // `verbatimModuleSyntax`)
      item.units.length > 0 &&
      item.units.every((id) => units[id]!.kind === 'type') &&
      (item.kind !== 'ImportDeclaration' ||
        item.units.every((id) => !units[id]!.stripped))
    ) {
      for (const unit of item.units) {
        erased.add(unit)
      }
      continue
    }
    const inside =
      item !== undefined &&
      comment.start >= item.nodeRange.start &&
      comment.end <= item.nodeRange.end
    if (
      comment.value.includes('@jsx') ||
      (inside &&
        (item.kind === 'ImportDeclaration' ||
          item.kind === 'ExpressionStatement'))
    ) {
      continue
    }
    const text = file.source.slice(comment.start, comment.end)
    copies.push(
      leadsItsLine(file.source, comment, bounds) ? `${text}\n` : `;${text}\n`,
    )
  }
  for (const [groupKey, g] of groups) {
    if (!g.component) {
      continue
    }
    const output = ctx.declareOutput({
      kind: 'split',
      key: groupKey,
      derived: { kind: 'split', value: groupKey },
    })
    for (const unit of erased) {
      ctx.addRoot(output, { t: 'unit', id: unit })
    }
    if (copies.length > 0) {
      ctx.rewrites.addGenerated({
        body: [{ k: 'text', parts: copies }],
        declares: [],
        effectful: false,
        anchor: { k: 'after-header' },
        home: output,
        by: ROUTER_PLANNER,
      })
    }
  }
}

/** The comments of a module by their end and by their start offsets. */
interface CommentBounds {
  byEnd: Map<number, number>
  byStart: Map<number, number>
}

/**
 * Whether only whitespace and comments precede `comment` on its line, or
 * follow it in the module (the two places a refresh plugin that does not
 * read every comment reads one).
 */
function leadsItsLine(
  source: string,
  comment: Comment,
  { byEnd, byStart }: CommentBounds,
): boolean {
  for (let p = comment.end; ; ) {
    while (p < source.length && /\s/.test(source[p]!)) {
      p++
    }
    if (p === source.length) {
      return true
    }
    const next = byStart.get(p)
    if (next === undefined) {
      break
    }
    p = next
  }
  for (let p = comment.start; ; ) {
    while (p > 0 && /[^\S\n\r\u2028\u2029]/.test(source[p - 1]!)) {
      p--
    }
    if (p === 0 || /[\n\r\u2028\u2029]/.test(source[p - 1]!)) {
      return true
    }
    const previous = byEnd.get(p)
    if (previous === undefined) {
      return false
    }
    // (the line begins inside a comment that spans lines)
    if (/[\n\r\u2028\u2029]/.test(source.slice(previous, p))) {
      return true
    }
    p = previous
  }
}

/**
 * Webpack-style hosts: a split chunk holding a non-component option (the
 * `loader`) reports each evaluation to the route HMR runtime, so an edit of
 * that option alone reaches the page. The chunk accepts nothing itself: its
 * update bubbles to its importer. The route module (self-accepting)
 * refreshes the route when it evaluates again; Rspack's lazy-compilation
 * proxy re-resolves the chunk alone, whose evaluation then refreshes the
 * route (`applyRouteChunkHmr`). Vite re-runs the dynamic importer itself.
 * React's and Vue's component-only chunks are their refresh runtime's.
 * Every Solid chunk reports too, with its exports and whether it holds a
 * non-component option: solid-refresh makes a chunk holding components
 * accept its own updates, so nothing imports it again, and the chunk hands
 * its exports to the route's lazy wrappers itself.
 */
function chunkHmr(
  ctx: PlanContext,
  round: RouterRound,
  groups: SplitGroups,
): void {
  const solid = round.cfg.framework === 'solid'
  for (const [groupKey, { nonComponent }] of groups) {
    if (!nonComponent && !solid) {
      continue
    }
    const output = ctx.declareOutput({
      kind: 'split',
      key: groupKey,
      derived: { kind: 'split', value: groupKey },
    })
    const helper = ctx.names.alloc('tsrChunkHmr')
    const hmrSpecifier = `${round.route.routerPackage}/hmr`
    ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'if (import.meta.webpackHot) {\n  ',
            { sym: helper.sym, ctx: 'callee' },
            `(${stringLiteral(ctx.identity.canonicalId, '"')}, ${stringLiteral(groupKey, '"')}${solid ? `, __webpack_module__.exports, ${nonComponent}` : ''})\n}\n`,
          ],
        },
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home: output,
      by: ROUTER_PLANNER,
      imports: [
        {
          names: [{ imported: '__tsrRouteChunkHmr', local: helper.sym }],
          spec: {
            k: 'spec',
            specifier: hmrSpecifier,
            edgeKey: ctx.edgeKey(hmrSpecifier, 'static', 'runtime'),
          },
        },
      ],
    })
  }
}

/**
 * Webpack-style hosts: every derived module of the file that imports a
 * binding the route module keeps, other than the route (placement decides
 * which: `env-readers`), hands its hot handle to the route HMR runtime. The
 * route module self-accepts, so an update of it reaches no such module (its
 * text did not change) and the module would go on reading the bindings of
 * the route module's earlier evaluation: the route module's next evaluation
 * invalidates them and refreshes the route once the update is applied
 * (`applyRouteHmr`). Vite's update holds every module of the edited file.
 */
function keptReaderHmr(ctx: PlanContext, round: RouterRound): void {
  const helper = ctx.names.alloc('tsrKeptReaderHmr')
  const hmrSpecifier = `${round.route.routerPackage}/hmr`
  ctx.rewrites.addGenerated({
    body: [
      {
        k: 'text',
        parts: [
          'if (import.meta.webpackHot) {\n  ',
          { sym: helper.sym, ctx: 'callee' },
          `(${stringLiteral(ctx.identity.canonicalId, '"')}, import.meta.webpackHot)\n}\n`,
        ],
      },
    ],
    declares: [],
    effectful: true,
    anchor: { k: 'end' },
    home: { k: 'env-readers', besides: [round.route.routeSym] },
    by: ROUTER_PLANNER,
    imports: [
      {
        names: [{ imported: '__tsrKeptReaderHmr', local: helper.sym }],
        spec: {
          k: 'spec',
          specifier: hmrSpecifier,
          edgeKey: ctx.edgeKey(hmrSpecifier, 'static', 'runtime'),
        },
      },
    ],
  })
}
