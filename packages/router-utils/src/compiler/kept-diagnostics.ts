/**
 * The user-facing warning for a declaration only split code needs that
 * stays in the env module (`Placement.kept`), and the benign-call judgement
 * it shares with placement (`firstImpure`). The planners supply the words:
 * how their outputs are named (`OutputSpec.describe`) and what the module
 * is (`PlanContext.describeModule`).
 */
import { isPureExpression } from './purity'
import { unwrapExpression } from './source'
import type { AnalysisPlan } from './plan'
import type { KeptDeclaration } from './reach'
import type { Diagnostic } from './diagnostics'
import type { Unit, UnitId } from './units'
import type { SymbolId } from './symbols'
import type { Node } from 'yuku'

/**
 * A declaration only split code needs stays in the env module, so it
 * loads with the module instead of lazily: the user is told
 * which, why and how to free it, once per declaration and wording (the
 * hosts' ledgers), positioned at the declaration. An exported one is not
 * extracted (its export names are the module's own); an unexported one is
 * kept by the movable test, the cause named with its line.
 */
export function keptDiagnostic(
  plan: AnalysisPlan,
  k: KeptDeclaration,
): Diagnostic {
  const { analysis, symbols } = plan
  const tag = plan.moduleWords === null ? '' : `${plan.moduleWords.tag} `
  const module = plan.moduleWords?.name ?? 'module'
  const file = plan.displayPath
  const code = analysis.source.code
  const text = (n: Node) => {
    const t = code.slice(n.start, n.end)
    return t.length > 40 || t.includes('\n')
      ? `${t.slice(0, 37).split('\n')[0]}…`
      : t
  }
  // `the call \`f(…)\` in \`validateSearch\``
  const describe = ({ node, key }: { node: Node; key: string | null }) => {
    const where = key === null ? '' : ` in \`${key}\``
    switch (node.type) {
      case 'CallExpression':
        return `the call \`${text(node.callee)}(…)\`${where}`
      case 'NewExpression':
        return `\`new ${text(node.callee)}(…)\`${where}`
      case 'AssignmentExpression':
        return `the assignment to \`${text(node.left)}\`${where}`
      default:
        return `\`${text(node)}\`${where}`
    }
  }
  const split = k.needers
    .map((o) => {
      const decl = plan.outputs.get(o)!
      if (decl.kind === 'export') {
        return `the module of the export \`${decl.key.slice('export~'.length)}\``
      }
      return decl.describe ?? `\`${decl.key.split('~').join('`, `')}\``
    })
    .join(', ')
  const line = (at: number) => `line ${analysis.source.locate(at).line + 1}`
  if (k.exported) {
    const names = analysis.exports.flatMap((e) =>
      e.kind === 'local' && e.local === k.syms[0] && !e.typeOnly
        ? [`\`${e.name}\``]
        : [],
    )
    const one = names.length === 1
    const declaring = (plan.t1.declaringUnits.get(k.syms[0]!) ?? [])[0]
    const unit = declaring === undefined ? null : plan.t1.units[declaring]!
    let why: string
    let fix: string
    switch (k.reason) {
      case 'effects':
        if (unit?.effectful) {
          why = 'its initialiser has side effects'
          fix = `Move it to its own module and import it from there${annotatable(plan, k.syms) ? ', or mark the call `/* @__PURE__ */` if it has none' : ''}.`
        } else {
          why = 'a statement setting a property of it has side effects'
          fix =
            'Move it and the statements setting its properties to their own module and import it from there.'
        }
        break
      case 'reassigned':
        why = 'it is reassigned'
        fix =
          'Move it and the code assigning it to their own module and import it from there, or stop exporting it if no other file imports it.'
        break
      case 'reads':
        why = `it reads, when it loads, a binding the ${module} keeps`
        fix =
          'Move it, with the bindings it reads when it loads, to their own module and import it from there.'
        break
      default: {
        // `order`: its extracted module would evaluate before the module's body
        const effect = k.effect === undefined ? null : effectAt(plan, k.effect)
        why =
          effect === null
            ? 'an effect of the module keeps it in place'
            : `${describe(effect)} (${line(effect.node.start)}) runs before it and ${k.effectStays ? 'stays' : 'does not move with it'}`
        fix =
          'Move it and the statements setting its properties to their own module and import it from there.'
        break
      }
    }
    return {
      severity: 'warning',
      message: `${tag}The export${one ? '' : 's'} ${names.join(', ')} of ${file} ${one ? 'is' : 'are'} used only by the split ${split}, but ${one ? 'stays' : 'stay'} in the ${module} because ${why}, so ${one ? 'it loads' : 'they load'} with the ${module} instead of with that code. ${fix}`,
      range: k.range,
      by: 'core',
      code: `eager-export:${k.reason}`,
    }
  }
  const names = k.syms.map((s) => `\`${symbols.name(s)}\``)
  const subject = names.join(', ')
  // the pronouns of the subject (`it`), the object (`them`) and the owner
  const it = names.length === 1 ? 'it' : 'they'
  const them = names.length === 1 ? 'it' : 'them'
  const own = names.length === 1 ? 'its' : 'their'
  // one declaration (a destructuring too) or several: their initialisers
  const declarations = new Set(
    k.syms.flatMap((s) => plan.t1.declaringUnits.get(s) ?? []),
  ).size
  const several = declarations > 1
  const initialiser = several ? `${own} initialisers` : `${own} initialiser`
  const itHas = several ? 'they have' : 'it has'
  const read = k.read === undefined ? '' : `\`${symbols.name(k.read)}\``
  let because: string
  let fix: string
  switch (k.reason) {
    case 'order': {
      // the least effort first: move the declaration below the effect
      // (it then follows it, wherever it loads), or the effect's value
      // above it; an annotation only where the effect is a call
      const effect = effectAt(plan, k.effect!)
      because = `${describe(effect)} (${line(effect.node.start)}) runs after ${them} and ${k.effectStays ? 'stays' : 'does not move with it'}`
      const unit = plan.t1.units[k.effect!]!
      const after =
        unit.declares.length > 0
          ? unit.declares.map((s) => `\`${symbols.name(s)}\``).join(', ')
          : 'it'
      const fixes = [`declare ${subject} after ${after}`]
      if (plan.benignEffects.has(k.effect!)) {
        fixes.push(`create that value in a \`const\` before ${subject}`)
      }
      if (
        (effect.node.type === 'CallExpression' ||
          effect.node.type === 'NewExpression') &&
        annotationFrees(plan, effect.node)
      ) {
        const local = localFunctionName(plan, effect.node.callee)
        const annotations = [
          ...(local === null
            ? []
            : [`mark \`${local}\` \`/* #__NO_SIDE_EFFECTS__ */\``]),
          'mark the call `/* @__PURE__ */`',
        ]
        annotations[annotations.length - 1] += ' if it has no side effects'
        fixes.push(...annotations)
      }
      const last = fixes.pop()!
      fix = fixes.length === 0 ? last : `${fixes.join(', ')}, or ${last}`
      break
    }
    case 'needers':
      because = `several split options read ${them} (${split}) and ${initialiser} ${several ? 'have' : 'has'} side effects, which run once`
      fix = `move ${subject} to ${own} own module${annotatable(plan, k.syms) ? `, or mark ${initialiser} \`/* @__PURE__ */\` if ${itHas} none` : ''}`
      break
    case 'written':
      because = `the module changes ${them} outside ${own} declaration${several ? 's' : ''} when it loads (${line(k.at!)})`
      fix = `move ${subject} and what writes ${them} to their own module${annotatable(plan, k.syms) ? `, or mark ${initialiser} \`/* @__PURE__ */\` if ${itHas} no side effects` : ''}`
      break
    case 'shared':
      // an exported binding's extracted module and other split code both
      // read a value with an identity (or state): one instance, in the module
      because = `an exported binding's split module and other split options (${split}) read ${them}, and ${it} ${names.length === 1 ? 'has' : 'have'} an identity or state (an object, array, class, call result or written binding), which exists once`
      fix = `declare ${subject} in the module that uses ${them}, or read ${them} through a function`
      break
    case 'state':
      because =
        k.read === undefined
          ? `${it} read${it === 'it' ? 's' : ''}, when the module loads, a binding the module changes`
          : `${it} read${it === 'it' ? 's' : ''} ${read} when the module loads, and the module writes ${read}`
      fix = `read ${k.read === undefined ? 'that binding' : read} inside the code that needs it, or move both to their own module`
      break
    default:
      because = `${it} read${it === 'it' ? 's' : ''} ${read} when the module loads, and ${read} ${symbols.isConst(k.read!) ? 'has side effects' : 'is a `let`'}`
      fix = `move ${subject} and ${read} to their own module${annotatable(plan, [k.read!]) ? `, or mark ${read}'s initialiser \`/* @__PURE__ */\` if it has no side effects` : ''}`
      break
  }
  return {
    severity: 'warning',
    message: `${tag}${subject} in ${file} stay${names.length === 1 ? 's' : ''} in the ${module} because ${because}; ${fix}, so ${subject} can load with the split ${split}.`,
    range: k.range,
    by: 'core',
    code: `eager-split:${k.reason}`,
  }
}

/**
 * Whether `/* @__PURE__ *\/` (or `#__NO_SIDE_EFFECTS__` on its callee) frees
 * an effect: it is a call or `new` whose arguments are pure. The purity
 * model ignores the annotation anywhere else (a template literal, an
 * object, a call with an argument that has effects), so a hint to add it
 * would not work. The one gate of every annotation hint.
 */
function annotationFrees(plan: AnalysisPlan, node: Node | null): boolean {
  const n = node === null ? null : unwrapExpression(node)
  return (
    (n?.type === 'CallExpression' || n?.type === 'NewExpression') &&
    n.arguments.every(
      (a) =>
        a.type !== 'SpreadElement' && isPureExpression(plan.analysis.purity, a),
    )
  )
}

/**
 * Whether marking the initialisers of the declarations of `syms` frees
 * them: each one with effects is an initialiser `annotationFrees` (a `using`
 * declaration's own effect no annotation removes).
 */
function annotatable(
  plan: AnalysisPlan,
  syms: ReadonlyArray<SymbolId>,
): boolean {
  const { t1, analysis } = plan
  let any = false
  for (const u of new Set(
    syms.flatMap((s) => t1.declaringUnits.get(s) ?? []),
  )) {
    const unit = t1.units[u]!
    if (!unit.effectful) {
      continue
    }
    const decl =
      unit.node.type === 'VariableDeclarator'
        ? analysis.file.parentOf(unit.node)
        : null
    if (
      unit.node.type !== 'VariableDeclarator' ||
      (decl?.type === 'VariableDeclaration' &&
        (decl.kind === 'using' || decl.kind === 'await using')) ||
      !annotationFrees(plan, unit.node.init)
    ) {
      return false
    }
    any = true
  }
  return any
}

/** The name of a callee that is a function declared in this module (`function f`, `const f = () => …`), which `#__NO_SIDE_EFFECTS__` can mark. */
function localFunctionName(plan: AnalysisPlan, callee: Node): string | null {
  const id = unwrapExpression(callee)
  if (id.type !== 'Identifier') {
    return null
  }
  const file = plan.analysis.file
  const b = file.referenceOf(id)?.binding
  const decl = b?.scope === file.rootScope ? b.declarations[0] : undefined
  const parent = decl ? file.parentOf(decl) : null
  const fn =
    parent?.type === 'FunctionDeclaration' ||
    (parent?.type === 'VariableDeclarator' &&
      parent.init !== null &&
      (unwrapExpression(parent.init).type === 'ArrowFunctionExpression' ||
        unwrapExpression(parent.init).type === 'FunctionExpression'))
  return fn ? id.name : null
}

/** The expression that makes a unit an effect: for a recognised call a planner named, the option value or argument that is not pure (`firstImpure`). */
function effectAt(
  plan: AnalysisPlan,
  u: UnitId,
): { node: Node; key: string | null } {
  const unit = plan.t1.units[u]!
  const option = plan.benignEffects.has(u) ? firstImpure(plan, unit) : null
  const node =
    option?.node ??
    (unit.node.type === 'ExpressionStatement'
      ? unit.node.expression
      : unit.node.type === 'VariableDeclarator' && unit.node.init
        ? unit.node.init
        : unit.node)
  return { node: unwrapExpression(node), key: option?.key ?? null }
}

/**
 * The value that makes a unit no benign call chain: the first impure
 * argument, or option value with its property key; the unit's own
 * expression when it is no call chain; null when benign. A unit a planner
 * named benign is when its expression is a call chain (`f(a)(b)`,
 * `f(a).g(b)`) whose every argument is a pure value. An object literal
 * argument is judged per property; a value that is a claimed region
 * evaluates in another output through a pure wrapper, and one the env
 * output erases not at all.
 */
export function firstImpure(
  plan: AnalysisPlan,
  unit: Unit,
): { node: Node; key: string | null } | null {
  const { analysis, rewrites } = plan
  const node = unit.node
  const expr =
    node.type === 'VariableDeclarator'
      ? node.init
      : node.type === 'ExpressionStatement'
        ? node.expression
        : node.type === 'ExportDefaultDeclaration'
          ? node.declaration
          : null
  if (expr === null) {
    return { node, key: null }
  }
  const env = rewrites.tree('env')
  const claimed = (v: Node): boolean => {
    for (const claim of rewrites.claims.values()) {
      const r = plan.t1.regions.get(claim.region).range
      if (r.start === v.start && r.end === v.end) {
        return true
      }
    }
    return false
  }
  const impureIn = (
    v: Node,
    key: string | null,
  ): { node: Node; key: string | null } | null => {
    const n = unwrapExpression(v)
    // the common values: a function, an identifier, a literal
    if (
      n.type === 'ArrowFunctionExpression' ||
      n.type === 'FunctionExpression' ||
      n.type === 'Identifier' ||
      n.type === 'Literal'
    ) {
      return null
    }
    if (claimed(v) || env.isErasedAt(v.start)) {
      return null
    }
    if (n.type === 'ObjectExpression') {
      for (const p of n.properties) {
        if (p.type === 'SpreadElement') {
          if (!isPureExpression(analysis.purity, p)) {
            return { node: p, key }
          }
          continue
        }
        if (p.computed && !isPureExpression(analysis.purity, p.key as Node)) {
          return { node: p.key as Node, key }
        }
        if (p.kind !== 'init' || env.isErasedAt(p.start)) {
          continue
        }
        const found = impureIn(
          p.value as Node,
          p.computed ? key : propertyName(p.key as Node),
        )
        if (found !== null) {
          return found
        }
      }
      return null
    }
    return isPureExpression(analysis.purity, v) ? null : { node: v, key }
  }
  let n: Node = unwrapExpression(expr)
  let calls = 0
  for (;;) {
    if (n.type === 'CallExpression') {
      calls++
      for (const a of n.arguments) {
        const found =
          a.type === 'SpreadElement'
            ? { node: a, key: null }
            : impureIn(a, null)
        if (found !== null) {
          return found
        }
      }
      n = unwrapExpression(n.callee)
    } else if (n.type === 'MemberExpression' && !n.computed) {
      n = unwrapExpression(n.object)
    } else {
      return calls > 0 ? null : { node: expr, key: null }
    }
  }
}

/** The name of a non-computed property key (`validateSearch`, `'a-b'`), for diagnostics. */
function propertyName(key: Node): string | null {
  return key.type === 'Identifier'
    ? key.name
    : key.type === 'Literal'
      ? String(key.value)
      : null
}
