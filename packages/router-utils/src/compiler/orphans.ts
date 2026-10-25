/**
 * Declarations only erased code read, below the units placement decides
 * (SPEC G16 "destructuring", J4.12): function-local declarators and
 * destructuring leaves of kept declarations. A service for the planners
 * that erase code (start-env's removals, route-split's `deleteNodes`): each
 * calls it after its erasures, on the liveness of the output it erased in.
 * Module-level declarations, imports and their provenance are placement's
 * (`reach.ts`).
 */
import { bindingIdentifiers } from 'yuku'
import { extendOverTrailingLine } from './header'
import { isPureExpression } from './purity'
import type { Node } from 'yuku'
import type { Range } from './header'
import type { PlanContext } from './plan'
import type { EditScope, Frag, LivenessView } from './rewrite'

const text = (part: string): Frag => ({ k: 'text', parts: [part] })
const slice = (range: Range): Frag => ({ k: 'slice', range })
const rangeOf = (n: Node): Range => ({ start: n.start, end: n.end })

/**
 * Function-local declarators (and `var`/block declarators of the module
 * level the core's units do not model) and destructuring leaves all of
 * whose references are erased in the env output: pure initialisers go with
 * the declarator; an impure initialiser at function level stays as an
 * expression statement (its hook calls keep running); module level drops it
 * with the declaration (J4.12, documented removal). Iterates to a fixpoint.
 */
export function cleanOrphanedDeclarations(
  ctx: PlanContext,
  scope: EditScope,
  by: string,
): void {
  const { t1, symbols, rewrites } = ctx
  const file = ctx.analysis.file
  const code = ctx.analysis.source.code
  const handled = new Set<number>()
  for (let round = 0; round < 8; round++) {
    const live = ctx.liveness('env')
    let changed = false
    // object pattern properties pruned this round, removed together per pattern
    const prunedProps = new Map<Node, Set<Node>>()
    // declarators of multi-declarator statements pruned this round, removed
    // together per statement (R17: one edit per statement from the final set)
    const prunedDecls = new Map<Node, Set<Node>>()
    // declarators removed whole this round (every binding of a pattern)
    const removedDeclarators = new Set<Node>()
    for (const b of file.bindings) {
      if (handled.has(b.id) || b.import) {
        continue
      }
      const sym = symbols.ofBinding(b)
      if (symbols.kind(sym) !== 'source') {
        continue
      }
      const decl = b.declarations[0]
      const declParent = decl ? file.parentOf(decl) : null
      // a `var` hoisted out of a nested block is declared by the effect unit
      // (statement) holding it: its declarator is cleaned here, like before
      const declaring = t1.declaringUnits.get(sym)
      if (
        symbols.isModuleLevel(sym) &&
        declaring !== undefined &&
        declaring.some((u) => t1.units[u]!.kind !== 'effect') &&
        declParent?.type !== 'AssignmentPattern' &&
        declParent?.type !== 'Property' &&
        declParent?.type !== 'ArrayPattern' &&
        declParent?.type !== 'RestElement'
      ) {
        continue // the core's placement decides top-level units (destructuring leaves are pruned here)
      }
      if (!decl || b.declarations.length !== 1) {
        continue
      }
      const parent = file.parentOf(decl)
      if (!parent) {
        continue
      }
      const refs = t1.refs.refsOf(sym)
      if (refs.length === 0 || !refs.every((r) => !live.live(r))) {
        continue
      }
      if (live.isErased(rangeOf(decl))) {
        handled.add(b.id)
        continue
      }
      const inPattern =
        parent.type === 'AssignmentPattern' ||
        parent.type === 'Property' ||
        parent.type === 'ArrayPattern' ||
        parent.type === 'RestElement'
      // a declarator goes whole when every binding it declares is orphaned
      // (a function-level pattern too: `const {} = serverConfig` would keep
      // reading its import); module-level declarators are placement's
      const declarator =
        parent.type === 'VariableDeclarator' && parent.id === decl
          ? parent
          : inPattern && !symbols.isModuleLevel(sym)
            ? orphanedPatternDeclarator(ctx, decl, live)
            : null
      if (declarator) {
        if (removedDeclarators.has(declarator)) {
          handled.add(b.id)
          continue
        }
        if (removeDeclarator(ctx, declarator, scope, by, live, prunedDecls)) {
          removedDeclarators.add(declarator)
          handled.add(b.id)
          changed = true
          continue
        }
      }
      if (inPattern) {
        if (prunePatternElement(ctx, decl, scope, by, prunedProps, live)) {
          handled.add(b.id)
          changed = true
        }
        continue
      }
      if (
        (parent.type === 'FunctionDeclaration' ||
          parent.type === 'ClassDeclaration') &&
        parent.id === decl &&
        t1.isLazyAt(parent.start)
      ) {
        const stmtParent = file.parentOf(parent)
        if (!stmtParent || stmtParent.type !== 'BlockStatement') {
          continue
        }
        if (
          parent.type === 'ClassDeclaration' &&
          !isPureExpression(ctx.analysis.purity, parent)
        ) {
          continue
        }
        handled.add(b.id)
        changed = true
        rewrites.add({
          range: {
            start: parent.start,
            end: extendOverTrailingLine(code, parent.end),
          },
          body: [],
          scope,
          by,
          reason: 'orphaned local declaration',
        })
      }
    }
    for (const [pattern, props] of prunedProps) {
      removePatternProperties(ctx, pattern, props, live, scope, by)
    }
    for (const [statement, decls] of prunedDecls) {
      removeDeclarators(ctx, statement, decls, live, scope, by)
    }
    if (!changed) {
      break
    }
  }
}

/**
 * Removes a declarator all of whose bindings are orphaned, or reports that
 * it cannot: a single declarator's statement goes, or becomes its impure
 * initialiser at function level; a declarator of several is pruned with its
 * neighbours (`prunedDecls`) unless its initialiser's effects must stay.
 */
function removeDeclarator(
  ctx: PlanContext,
  declarator: Node,
  scope: EditScope,
  by: string,
  live: LivenessView,
  prunedDecls: Map<Node, Set<Node>>,
): boolean {
  if (declarator.type !== 'VariableDeclarator') {
    return false
  }
  const file = ctx.analysis.file
  const code = ctx.analysis.source.code
  const statement = file.parentOf(declarator)
  if (!statement || statement.type !== 'VariableDeclaration') {
    return false
  }
  // an impure initialiser at function level stays as a statement whatever it
  // reads: a hook call must keep running (hook order equal on both sides),
  // and the import it reads stays with it
  const moduleLevel = !ctx.t1.isLazyAt(declarator.start)
  const effectsGo =
    declarator.init === null ||
    isPureExpression(ctx.analysis.purity, declarator.init) ||
    moduleLevel
  if (statement.declarations.length === 1) {
    if (!isStatementPosition(file.parentOf(statement))) {
      return false
    }
    ctx.rewrites.add(
      effectsGo
        ? {
            range: {
              start: statement.start,
              end: extendOverTrailingLine(code, statement.end),
            },
            body: [],
            scope,
            by,
            reason: 'orphaned local declaration',
          }
        : {
            range: { start: statement.start, end: statement.end },
            body: expressionStatement(code, declarator.init!),
            scope,
            by,
            reason: 'orphaned local declarator: effects kept',
          },
    )
    return true
  }
  if (!effectsGo) {
    return false
  }
  let set = prunedDecls.get(statement)
  if (!set) {
    set = new Set()
    prunedDecls.set(statement, set)
  }
  set.add(declarator)
  return true
}

/** Whether a statement in `parent` stands in a statement list (it may become another statement or go). */
function isStatementPosition(parent: Node | null): boolean {
  return (
    parent !== null &&
    (parent.type === 'BlockStatement' ||
      parent.type === 'Program' ||
      parent.type === 'SwitchCase' ||
      parent.type === 'StaticBlock')
  )
}

/**
 * The declarator whose pattern holds `decl`, when every binding it declares
 * has references and none is live.
 */
function orphanedPatternDeclarator(
  ctx: PlanContext,
  decl: Node,
  live: LivenessView,
): Node | null {
  const file = ctx.analysis.file
  let node: Node | null = file.parentOf(decl)
  while (
    node &&
    (node.type === 'AssignmentPattern' ||
      node.type === 'Property' ||
      node.type === 'ArrayPattern' ||
      node.type === 'ObjectPattern' ||
      node.type === 'RestElement')
  ) {
    node = file.parentOf(node)
  }
  if (!node || node.type !== 'VariableDeclarator') {
    return null
  }
  for (const id of bindingIdentifiers(node.id)) {
    const b = file.bindingOf(id)
    if (!b) {
      return null
    }
    const refs = ctx.t1.refs.refsOf(ctx.symbols.ofBinding(b))
    if (refs.length === 0 || refs.some((r) => live.live(r))) {
      return null
    }
  }
  return node
}

/**
 * `init;` in place of a declaration statement: parenthesised when its first
 * token would start a block, a declaration or a `let` declaration instead
 * (`{ a: f() };`, `function () {}();`). The renderer guards a statement
 * start whose first token could continue the previous line.
 */
function expressionStatement(code: string, init: Node): Array<Frag> {
  const first = code.slice(init.start, init.start + 16)
  const wrap = /^(?:\{|function\b|class\b|async\s+function\b|let\s*\[)/.test(
    first,
  )
  if (wrap) {
    return [text('('), slice(rangeOf(init)), text(');')]
  }
  return [slice(rangeOf(init)), text(';')]
}

/**
 * Removes the declarators `pruned` of a multi-declarator statement (R17: the
 * removals of one statement are computed from its final kept set): when
 * every declarator is gone (pruned now, or erased by an earlier round) the
 * statement goes with its line; otherwise each run of gone declarators is
 * one range with the separator to its next kept declarator (or from its
 * previous one), so removals of neighbours never partially overlap, and a
 * later round's run encloses the earlier one it grew from.
 */
function removeDeclarators(
  ctx: PlanContext,
  statement: Node,
  pruned: ReadonlySet<Node>,
  live: ReturnType<PlanContext['liveness']>,
  scope: EditScope,
  by: string,
): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }
  const code = ctx.analysis.source.code
  const decls = statement.declarations as ReadonlyArray<Node>
  const gone = (d: Node) => pruned.has(d) || live.isErased(rangeOf(d))
  if (decls.every(gone)) {
    const stmtParent = ctx.analysis.file.parentOf(statement)
    const asStatement =
      stmtParent !== null &&
      (stmtParent.type === 'BlockStatement' ||
        stmtParent.type === 'Program' ||
        stmtParent.type === 'SwitchCase' ||
        stmtParent.type === 'StaticBlock')
    if (asStatement) {
      ctx.rewrites.add({
        range: {
          start: statement.start,
          end: extendOverTrailingLine(code, statement.end),
        },
        body: [],
        scope,
        by,
        reason: 'orphaned local declaration',
      })
      return
    }
  }
  // a declaration that is no statement (`for (const a = 1, b = 2;;)`) keeps
  // its last declarator so the syntax stays
  const last = decls[decls.length - 1]!
  const keepLast = decls.every(gone)
  const isGone = (d: Node) => gone(d) && !(keepLast && d === last)
  for (let i = 0; i < decls.length; i++) {
    if (!isGone(decls[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < decls.length && isGone(decls[j + 1]!)) {
      j++
    }
    if (decls.slice(i, j + 1).some((d) => pruned.has(d))) {
      const next = decls[j + 1]
      const prev = decls[i - 1]
      ctx.rewrites.add({
        range: next
          ? { start: decls[i]!.start, end: next.start }
          : { start: prev!.end, end: decls[j]!.end },
        body: [],
        scope,
        by,
        reason: 'orphaned local declarator',
      })
    }
    i = j
  }
}

/**
 * Removes the properties `pruned` of an object pattern: each run of
 * properties gone (pruned now, or erased by an earlier round) is one range
 * with the separator to its next kept property (or from its previous one),
 * so removals of neighbours never partially overlap.
 */
function removePatternProperties(
  ctx: PlanContext,
  pattern: Node,
  pruned: ReadonlySet<Node>,
  live: ReturnType<PlanContext['liveness']>,
  scope: EditScope,
  by: string,
): void {
  if (pattern.type !== 'ObjectPattern') {
    return
  }
  const props = pattern.properties as ReadonlyArray<Node>
  const gone = (p: Node) => pruned.has(p) || live.isErased(rangeOf(p))
  for (let i = 0; i < props.length; i++) {
    if (!gone(props[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < props.length && gone(props[j + 1]!)) {
      j++
    }
    if (props.slice(i, j + 1).some((p) => pruned.has(p))) {
      const next = props[j + 1]
      const prev = props[i - 1]
      ctx.rewrites.add({
        range: next
          ? { start: props[i]!.start, end: next.start }
          : prev
            ? { start: prev.end, end: props[j]!.end }
            : { start: props[i]!.start, end: props[j]!.end },
        body: [],
        scope,
        by,
        reason: 'orphaned pattern property',
      })
    }
    i = j
  }
}

/**
 * Removes a destructuring element whose binding only removed code read (its
 * default value or computed key may read server-only imports): an object
 * pattern property goes with its comma (never while the pattern keeps a
 * rest element, which would then receive the key); an object rest element
 * goes too, after which its siblings may; an array pattern element becomes
 * a hole (the iterator is stepped as often as before), and an array rest
 * element stays (it exhausts the iterator).
 */
function prunePatternElement(
  ctx: PlanContext,
  decl: Node,
  scope: EditScope,
  by: string,
  prunedProps: Map<Node, Set<Node>>,
  live: LivenessView,
): boolean {
  const file = ctx.analysis.file
  let node: Node = decl
  let parent = file.parentOf(node)
  if (parent?.type === 'AssignmentPattern' && parent.left === node) {
    node = parent
    parent = file.parentOf(node)
  }
  if (!parent) {
    return false
  }
  if (parent.type === 'Property' || parent.type === 'RestElement') {
    const pattern = file.parentOf(parent)
    if (!pattern || pattern.type !== 'ObjectPattern') {
      return false
    }
    if (
      parent.type === 'Property' &&
      pattern.properties.some(
        (p) => p.type === 'RestElement' && !live.isErased(rangeOf(p)),
      )
    ) {
      return false
    }
    let set = prunedProps.get(pattern)
    if (!set) {
      set = new Set()
      prunedProps.set(pattern, set)
    }
    set.add(parent)
    return true
  }
  if (parent.type === 'ArrayPattern') {
    ctx.rewrites.add({
      range: { start: node.start, end: node.end },
      body: commaFollows(ctx.analysis.source.code, node.end) ? [] : [text(',')],
      scope,
      by,
      reason: 'orphaned pattern element',
    })
    return true
  }
  return false
}

/** Whether the next token after `pos` (past whitespace and comments) is a comma. */
function commaFollows(code: string, pos: number): boolean {
  let i = pos
  while (i < code.length) {
    const c = code[i]!
    if (/\s/.test(c)) {
      i++
    } else if (code.startsWith('//', i)) {
      const nl = code.slice(i).search(/[\n\r\u2028\u2029]/)
      i = nl === -1 ? code.length : i + nl
    } else if (code.startsWith('/*', i)) {
      const close = code.indexOf('*/', i + 2)
      i = close === -1 ? code.length : close + 2
    } else {
      return c === ','
    }
  }
  return false
}
