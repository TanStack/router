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
  const and = (items: ReadonlyArray<string>) =>
    items.length === 1
      ? items[0]!
      : `${items.slice(0, -1).join(', ')} and ${items.at(-1)!}`
  if (k.reason === 'unused') {
    // unused code (R148): what it keeps in the env module, or puts in one
    // shared module several split outputs import (R151)
    const unused = `\`${symbols.name(k.unused!)}\``
    const names = k.syms.map((s) => `\`${symbols.name(s)}\``)
    const more = k.moreUnused ?? []
    // (several unused declarations joining the same bindings: deleting all
    // of them separates them)
    const at = and([
      `${unused} (${line(k.range.start)})`,
      ...more.map((m) => `\`${symbols.name(m.sym)}\` (${line(m.at)})`),
    ])
    const one = names.length === 1
    return {
      severity: 'warning',
      message:
        k.shared === true
          ? `${tag}In ${file}, unused ${at} ${more.length === 0 ? 'puts' : 'put'} ${and(names)} in one shared module the split ${and(k.needers.map(output))} import; delete ${more.length === 0 ? unused : 'them'}, so each loads with the split code that needs it.`
          : `${tag}In ${file}, unused ${at} keeps ${and(names)} in the ${module}; delete ${unused}, so ${one ? 'it' : 'they'} can load with the split code that needs ${one ? 'it' : 'them'}.`,
      range: k.range,
      by: 'core',
      code: k.shared === true ? 'shared-split:unused' : 'eager-split:unused',
    }
  }
  if (k.exported) {
    const names = analysis.exports.flatMap((e) =>
      e.kind === 'local' && e.local === k.syms[0] && !e.typeOnly
        ? [`\`${e.name}\``]
        : [],
    )
    const one = names.length === 1
    let why: string
    let fix: string
    switch (k.reason) {
      case 'reassigned': {
        // the binding the export names is what is assigned (`export default
        // items` after `var items` is declared again)
        const binding = `\`${symbols.name(k.read ?? k.syms[0]!)}\``
        why = `${binding} is reassigned${k.at === undefined ? '' : ` (${line(k.at)})`}`
        fix = `Move ${binding} and the code assigning it to their own module and import it from there, or stop exporting it if no other file imports it.`
        break
      }
      case 'reads':
        // (a binding the compiler generated, a server fn it moved out of a
        // function the export calls, has no name in the source)
        if (k.read === undefined || symbols.kind(k.read) !== 'source') {
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
        // (only in a function it hands to a call: whether the call runs it
        // then is unknown, and the read is in a function already, R152)
        why =
          k.handedTo === undefined
            ? `it uses ${read} when it loads, and the ${module} writes ${read}`
            : `it may use ${read} when it loads (${handed(k.handedTo)}), and the ${module} writes ${read}`
        fix =
          k.handedTo === undefined
            ? `Use ${read} inside the code that needs it, or move both to their own module and import them from there.`
            : 'Move both to their own module and import them from there.'
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
  const read = k.read === undefined ? '' : `\`${symbols.name(k.read)}\``
  let because: string
  let fix: string
  switch (k.reason) {
    case 'written': {
      // a statement using it stays (R149): another binding it uses stays
      // or goes to an output no module shares with it (an extracted
      // export's module, R151), or code that runs later changes it
      const stays = `the statement on ${line(k.at!)}, which ${k.uses === true ? 'uses' : 'changes'} ${them}, stays there`
      const reader =
        k.reader === undefined ? '' : `\`${symbols.name(k.reader)}\``
      because =
        k.later !== undefined
          ? `${stays}: code that runs later changes ${them} too (${line(k.later)})`
          : k.reader !== undefined
            ? `${stays}: it changes ${read} later, which ${reader} uses when the module loads`
            : k.read !== undefined
              ? `${stays}: it also ${k.readChanged === true ? 'changes' : 'uses'} ${read}, which ${k.in === undefined ? `the ${module} keeps` : `${plan.outputs.get(k.in)!.kind === 'export' ? '' : 'the split '}${output(k.in)} uses`}`
              : stays
      fix =
        // (the later writer may be a line of a component: what moves is
        // what uses it when the module loads, recheck finding 6)
        k.later !== undefined
          ? `move ${subject} and the statements using ${them} when the module loads to their own module`
          : k.reader !== undefined
            ? `use ${read} inside the code that needs ${reader} instead of when the module loads`
            : k.read === undefined
              ? `move ${subject} and that statement to their own module`
              : k.split === true
                ? `change ${read} in a statement of its own`
                : k.in === undefined
                  ? `run that statement in the code that needs ${them}`
                  : `move ${subject}, ${read} and that statement to their own module`
      break
    }
    case 'shared':
      // an exported binding's extracted module and other split code both
      // read a value with an identity (or state): one instance, in the module
      because = `an exported binding's split module and other split options (${split}) read ${them}, and ${it} ${names.length === 1 ? 'has' : 'have'} an identity or state (an object, array, class, call result or written binding), which exists once`
      fix = `move ${subject} to ${own} own module, which both import`
      break
    default:
      // `state`
      because =
        k.read === undefined
          ? `${it} use${it === 'it' ? 's' : ''}, when the module loads, a binding the module changes`
          : k.handedTo !== undefined
            ? `${it} may use ${read} when the module loads (${handed(k.handedTo)}), and the module writes ${read}`
            : `${it} use${it === 'it' ? 's' : ''} ${read} when the module loads, and the module writes ${read}`
      // a statement writing it that uses the binding (`a.push(b)`) cannot
      // defer that use: only the move keeps both in order; a use in a
      // function handed to a call is inside a function already (R152)
      fix =
        k.read !== undefined && writtenWith(plan, k.syms, k.read)
          ? `move ${subject}, ${read} and the statements writing them to their own module`
          : k.read !== undefined && k.handedTo !== undefined
            ? 'move both to their own module'
            : `use ${k.read === undefined ? 'that binding' : read} inside the code that needs it, or move both to their own module`
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

/** The call a kept declaration hands the function using its binding to (`KeptDeclaration.handedTo`). */
function handed(callee: string): string {
  return callee === ''
    ? 'the function is handed to a call'
    : `the function is handed to \`${callee}\``
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
): boolean {
  const { t1, analysis } = plan
  const purity = analysis.effectPurity
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
      !annotationFrees(plan, unit.node.init, purity)
    ) {
      return false
    }
    any = true
  }
  return any
}
