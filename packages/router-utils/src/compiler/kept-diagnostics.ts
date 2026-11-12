/**
 * The user-facing warning for a declaration only split code needs that
 * stays in the env module (`Placement.kept`). The planners supply the words:
 * how their outputs are named (`OutputSpec.describe`) and what the module
 * is (`PlanContext.describeModule`).
 */
import { isPureExpression } from './purity'
import { unwrapExpression } from './source'
import type { PurityContext } from './purity'
import type { AnalysisPlan } from './plan'
import type { KeptDeclaration } from './reach'
import type { Diagnostic } from './diagnostics'
import type { SymbolId } from './symbols'
import type { OutputId } from './rewrite'
import type { Node } from 'yuku'

/**
 * A declaration only split code needs stays in the env module, so it
 * loads with the module instead of lazily: the user is told
 * which, why and how to free it, once per declaration and wording (the
 * hosts' ledgers), positioned at the declaration. An exported one is not
 * extracted (its export names are the module's own); an unexported one is
 * kept by a rule of the event table, the cause named with its line.
 */
export function keptDiagnostic(
  plan: AnalysisPlan,
  k: KeptDeclaration,
): Diagnostic {
  const { analysis, symbols } = plan
  const tag = plan.moduleWords === null ? '' : `${plan.moduleWords.tag} `
  const module = plan.moduleWords?.name ?? 'module'
  const file = plan.displayPath
  const output = (o: OutputId) => {
    const decl = plan.outputs.get(o)!
    if (decl.kind === 'export') {
      return `the module of the export \`${decl.key.slice('export~'.length)}\``
    }
    return decl.describe ?? `\`${decl.key.split('~').join('`, `')}\``
  }
  const split = k.needers.map(output).join(', ')
  const line = (at: number) => `line ${analysis.source.locate(at).line + 1}`
  if (k.exported) {
    const names = analysis.exports.flatMap((e) =>
      e.kind === 'local' && e.local === k.syms[0] && !e.typeOnly
        ? [`\`${e.name}\``]
        : [],
    )
    const one = names.length === 1
    const declaring = (plan.t1.declaringUnits.get(k.syms[0]!) ?? [])[0]
    let why: string
    let fix: string
    switch (k.reason) {
      case 'effects':
        // (judged as extraction is: what may run code never moves into an
        // extracted export's module, rule L aside)
        if (
          declaring !== undefined &&
          plan.t1.extractionEffects(declaring).effectful
        ) {
          why = 'its initialiser has side effects'
          fix = `Move it to its own module and import it from there${annotatable(plan, k.syms, true) ? ', or mark the call `/* @__PURE__ */` if it has none' : ''}.`
        } else {
          why = 'a statement setting a property of it has side effects'
          fix =
            'Move it and the statements setting its properties to their own module and import it from there.'
        }
        break
      case 'reassigned': {
        // the binding the export names is what is assigned (`export default
        // items` after `var items` is declared again)
        const binding = `\`${symbols.name(k.read ?? k.syms[0]!)}\``
        why = `${binding} is reassigned${k.at === undefined ? '' : ` (${line(k.at)})`}`
        fix = `Move ${binding} and the code assigning it to their own module and import it from there, or stop exporting it if no other file imports it.`
        break
      }
      case 'reads':
        if (k.read === undefined) {
          why = `it reads, when it loads, a binding the ${module} keeps`
          fix =
            'Move it, with the bindings it reads when it loads, to their own module and import it from there.'
        } else {
          const read = `\`${symbols.name(k.read)}\``
          why = `it reads ${read} when it loads, which the ${module} keeps`
          fix = `Move it and ${read} to their own module and import them from there.`
        }
        break
      case 'state': {
        // its module may evaluate later than the route module, after code
        // that writes what it reads
        const read = `\`${symbols.name(k.read!)}\``
        why = `it uses ${read} when it loads, and the ${module} writes ${read}`
        fix = `Use ${read} inside the code that needs it, or move both to their own module and import them from there.`
        break
      }
      default:
        // `unneeded`: no split output needed it once extraction was decided
        why = 'no split code needs its extracted module'
        fix = 'Stop exporting it if no other file imports it.'
        break
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
    case 'needers':
      because = `several split options read ${them} (${split}) and ${initialiser} ${several ? 'have' : 'has'} side effects, which run once`
      fix = `move ${subject} to ${own} own module${annotatable(plan, k.syms) ? `, or mark ${initialiser} \`/* @__PURE__ */\` if ${itHas} none` : ''}`
      break
    case 'written': {
      // a statement changing it stays (R146 amendment): what else it
      // changes keeps it, or several split options use what it changes
      const statement = `the statement on ${line(k.at!)}, which ${k.uses === true ? 'uses' : 'changes'} ${them}, stays there`
      const users = [
        ...new Set([...k.needers, ...(k.in === undefined ? [] : [k.in])]),
      ]
      because =
        k.read !== undefined
          ? `${statement}: it also ${k.uses === true ? 'uses' : 'changes'} ${read}, which ${k.in === undefined ? `the ${module} keeps` : `${plan.outputs.get(k.in)!.kind === 'export' ? '' : 'the split '}${output(k.in)} uses`}`
          : `${statement}: several split options use what it changes (${users.map(output).join(', ')})`
      fix =
        k.read !== undefined
          ? `change ${read} in a statement of its own`
          : `move ${subject} and that statement to their own module`
      break
    }
    case 'shared':
      // an exported binding's extracted module and other split code both
      // read a value with an identity (or state): one instance, in the module
      because = `an exported binding's split module and other split options (${split}) read ${them}, and ${it} ${names.length === 1 ? 'has' : 'have'} an identity or state (an object, array, class, call result or written binding), which exists once`
      fix = `move ${subject} to ${own} own module, which both import`
      break
    case 'state':
      because =
        k.read === undefined
          ? `${it} use${it === 'it' ? 's' : ''}, when the module loads, a binding the module changes`
          : `${it} use${it === 'it' ? 's' : ''} ${read} when the module loads, and the module writes ${read}`
      // a statement writing it that uses the binding (`a.push(b)`) cannot
      // defer that use: only the move keeps both in order
      fix =
        k.read !== undefined && writtenWith(plan, k.syms, k.read)
          ? `move ${subject}, ${read} and the statements writing them to their own module`
          : `use ${k.read === undefined ? 'that binding' : read} inside the code that needs it, or move both to their own module`
      break
    default: {
      // a `let` nothing assigns may be a `const`: one the route module
      // keeps is read from it (R67)
      const isLet = !symbols.isConst(k.read!)
      because = `${it} read${it === 'it' ? 's' : ''} ${read} when the module loads, and ${read} ${isLet ? 'is a `let`' : 'has side effects'}`
      const fixes = [
        ...(isLet && !plan.t1.mutation.isReassigned(k.read!)
          ? [`declare ${read} with \`const\``]
          : []),
        `move ${subject} and ${read} to their own module`,
        ...(annotatable(plan, [k.read!])
          ? [
              `mark ${read}'s initialiser \`/* @__PURE__ */\` if it has no side effects`,
            ]
          : []),
      ]
      const last = fixes.pop()!
      fix = fixes.length === 0 ? last : `${fixes.join(', ')}, or ${last}`
      break
    }
  }
  return {
    severity: 'warning',
    message: `${tag}${subject} in ${file} stay${names.length === 1 ? 's' : ''} in the ${module} because ${because}; ${fix}, so ${subject} can load with the split ${split}.`,
    range: k.range,
    by: 'core',
    code: `eager-split:${k.reason}`,
  }
}

/** Whether a statement writing one of `syms` (not its declaration) uses `read` (`a.push(b)`). */
function writtenWith(
  plan: AnalysisPlan,
  syms: ReadonlyArray<SymbolId>,
  read: SymbolId,
): boolean {
  const { t1 } = plan
  return syms.some((s) =>
    t1.mutation.sitesOf(s).some((site) => {
      const u = t1.unitAt(site.range)
      return (
        u !== null &&
        !t1.units[u]!.declares.includes(s) &&
        t1.refs.refsIn(t1.units[u]!.range).some((r) => r.sym === read)
      )
    }),
  )
}

/**
 * Whether `/* @__PURE__ *\/` (or `#__NO_SIDE_EFFECTS__` on its callee) frees
 * an effect: it is a call or `new` whose arguments are pure. The purity
 * model ignores the annotation anywhere else (a template literal, an
 * object, a call with an argument that has effects), so a hint to add it
 * would not work. The one gate of every annotation hint.
 */
function annotationFrees(
  plan: Pick<AnalysisPlan, 'analysis'>,
  node: Node | null,
  purity: PurityContext,
): boolean {
  const n = node === null ? null : unwrapExpression(node)
  return (
    (n?.type === 'CallExpression' || n?.type === 'NewExpression') &&
    n.arguments.every(
      (a) => a.type !== 'SpreadElement' && isPureExpression(purity, a),
    )
  )
}

/**
 * Whether marking the initialisers of the declarations of `syms` frees
 * them: each one with effects is an initialiser `annotationFrees` (a `using`
 * declaration's own effect no annotation removes).
 */
export function annotatable(
  plan: Pick<AnalysisPlan, 't1' | 'analysis'>,
  syms: ReadonlyArray<SymbolId>,
  /** The report rests on extraction's judgement (an export kept for its effects), not placement's timing (rule L). */
  extraction = false,
): boolean {
  const { t1, analysis } = plan
  const purity = extraction ? analysis.purity : analysis.effectPurity
  let any = false
  for (const u of new Set(
    syms.flatMap((s) => t1.declaringUnits.get(s) ?? []),
  )) {
    const unit = t1.units[u]!
    if (!(extraction ? t1.extractionEffects(u) : unit).effectful) {
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
      !annotationFrees(plan, unit.node.init, purity)
    ) {
      return false
    }
    any = true
  }
  return any
}
