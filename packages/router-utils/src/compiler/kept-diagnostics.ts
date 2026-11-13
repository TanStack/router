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
  /** A `state`, `reads` or `written` move (`k.moves`): `head` (the declaration, `read`) and what moves with them. */
  const moving = (head: ReadonlyArray<string>) => [
    ...head,
    ...(k.moves?.syms ?? []).map((s) => `\`${symbols.name(s)}\``),
    ...(k.moves?.statements ?? []).map((at) => `the statement on ${line(at)}`),
  ]
  /**
   * `state`: a read inside the code that needs it works only when the
   * module writes no moved binding when it loads (that code would see the
   * write) and the read is not in a function already (R152).
   */
  const inside =
    k.at === undefined && k.handedTo === undefined && k.moves?.written !== true
  /**
   * The `state` fix, capitalised: a read inside the code (`inside`), or the
   * move of `head` (the declaration, `read`; `it`: what it starts with when
   * the declaration is named so) and what moves with them, with the
   * statements writing them when the module writes one then.
   */
  const movePhrase = (head: ReadonlyArray<string>, it = '') => {
    const moved = moving(head)
    const what =
      k.at !== undefined || k.moves?.written === true
        ? `${it}${moved.join(', ')} and the statements writing them when the module loads`
        : k.moves === undefined
          ? 'both'
          : `${it}${and(moved)}`
    return inside
      ? `Use \`${symbols.name(k.read!)}\` inside the code that needs it, or move ${what}`
      : `Move ${what}`
  }
  /** Why no module of its own can take the declaration a move would take (`k.stuck`). */
  const stuck =
    k.stuck === undefined
      ? undefined
      : `it can't move to a module of its own: that module would also need ${k.stuck.sym === undefined ? `the code on ${line(k.stuck.at)}` : `\`${symbols.name(k.stuck.sym)}\``}, which stays in the ${module}`
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
          // (what they read when the module loads moves with them, `moving`:
          // left behind, the new module would import it back; none can:
          // `stuck`)
          fix =
            stuck !== undefined
              ? `${stuck[0]!.toUpperCase()}${stuck.slice(1)}.`
              : k.moves === undefined
                ? `Move it and ${read} to their own module and import them from there.`
                : k.moves.written
                  ? `Move it, ${moving([read]).join(', ')} and the statements writing them when the module loads to their own module and import them from there.`
                  : `Move it, ${and(moving([read]))} to their own module and import them from there.`
        }
        break
      case 'state': {
        // its module may evaluate later than the route module, after code
        // that writes what it reads
        const read = `\`${symbols.name(k.read!)}\``
        // (a write when the module loads, `at`: the read keeps its order
        // with it, so the statements writing move with them, and a read
        // inside the code that needs it would see that write)
        const writes =
          k.at === undefined
            ? `the ${module} writes ${read}`
            : `the ${module} writes ${read} then (${line(k.at)})`
        // (only in a function it hands to a call: whether the call runs it
        // then is unknown, and the read is in a function already, R152)
        why =
          k.handedTo === undefined
            ? `it uses ${read} when it loads, and ${writes}`
            : `it may use ${read} when it loads (${handed(k.handedTo)}), and ${writes}`
        fix =
          stuck === undefined
            ? `${movePhrase([read], 'it, ')} to their own module and import them from there.`
            : inside
              ? `Use ${read} inside the code that needs it.`
              : `${stuck[0]!.toUpperCase()}${stuck.slice(1)}.`
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
      // its own initialiser changes `read`, which the env module keeps:
      // that change stays, and the declaration with it (review round 2 F2-3)
      if (k.declaration === true) {
        because = `${own} declaration also changes ${read}, which the ${module} keeps`
        fix = `change ${read} in a statement of its own, and declare ${subject} without changing it`
        break
      }
      // a statement using it stays (R149): another binding it uses stays
      // or goes to an output no module shares with it (an extracted
      // export's module, R151), or code that runs later changes it
      const stays = `the statement on ${line(k.at!)}, which ${k.uses === true ? 'uses' : 'changes'} ${them}, stays there`
      // (code the module keeps sees what the statement changes, `seen`:
      // moving or deleting it would change that, no move is offered)
      if (k.seen !== undefined) {
        return {
          severity: 'warning',
          message: `${tag}${subject} in ${file} stay${names.length === 1 ? 's' : ''} in the ${module} because ${stays}: it also changes ${read}, which the ${module}'s code uses on ${line(k.seen)}; moving or deleting that statement would change what that code sees.`,
          range: k.range,
          by: 'core',
          code: `eager-split:${k.reason}`,
        }
      }
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
      // (a move takes what the moved code reads when the module loads,
      // `moving`, and the statements writing a moved binding then; none
      // can: `stuck`)
      const moves =
        k.reader === undefined &&
        (k.later !== undefined ||
          k.read === undefined ||
          (k.split !== true && k.in !== undefined))
      if (moves && stuck !== undefined) {
        return {
          severity: 'warning',
          message: `${tag}${subject} in ${file} stay${names.length === 1 ? 's' : ''} in the ${module} because ${because}; ${stuck}.`,
          range: k.range,
          by: 'core',
          code: `eager-split:${k.reason}`,
        }
      }
      /** The move of `head` and what moves with it, with that statement. */
      const withStatement = (head: ReadonlyArray<string>) => {
        const moved = [...moving(head), 'that statement']
        return k.moves?.written === true
          ? `${moved.join(', ')} and the statements writing them when the module loads`
          : and(moved)
      }
      // (the later writer may be a line of a component: what moves is
      // what uses it when the module loads, recheck finding 6)
      const later = [
        ...names,
        ...(k.moves?.syms ?? []).map((s) => `\`${symbols.name(s)}\``),
      ]
      fix =
        k.later !== undefined
          ? `move ${later.join(', ')} and the statements using ${later.length === 1 ? 'it' : 'them'} when the module loads to their own module`
          : k.reader !== undefined
            ? `use ${read} inside the code that needs ${reader} instead of when the module loads`
            : k.read === undefined
              ? `move ${withStatement(names)} to their own module`
              : k.split === true
                ? `change ${read} in a statement of its own`
                : k.in === undefined
                  ? `run that statement in the code that needs ${them}`
                  : `move ${withStatement([...names, read])} to their own module`
      break
    }
    case 'shared':
      // an exported binding's extracted module and other split code both
      // read a value with an identity (or state): one instance, in the module
      because = `an exported binding's split module and other split options (${split}) read ${them}, and ${it} ${names.length === 1 ? 'has' : 'have'} an identity or state (an object, array, class, call result or written binding), which exists once`
      fix = `move ${subject} to ${own} own module, which both import`
      break
    default: {
      // `state`; a write when the module loads (`at`) is named
      const writes = `the module writes ${read}${k.at === undefined ? '' : ` then (${line(k.at)})`}`
      because =
        k.read === undefined
          ? `${it} use${it === 'it' ? 's' : ''}, when the module loads, a binding the module changes`
          : k.handedTo !== undefined
            ? `${it} may use ${read} when the module loads (${handed(k.handedTo)}), and ${writes}`
            : `${it} use${it === 'it' ? 's' : ''} ${read} when the module loads, and ${writes}`
      // a statement writing it that uses the binding (`a.push(b)`) cannot
      // defer that use: only the move keeps both in order, and so does a
      // write when the module loads (a use inside the code would see it);
      // a use in a function handed to a call is inside a function already
      // (R152)
      // (what moves with them, `moving`; none can: `stuck`, and a read
      // inside the code that needs it, if it works, is the fix)
      if (k.read === undefined) {
        fix =
          'use that binding inside the code that needs it, or move both to their own module'
      } else if (stuck !== undefined) {
        if (!inside) {
          return {
            severity: 'warning',
            message: `${tag}${subject} in ${file} stay${names.length === 1 ? 's' : ''} in the ${module} because ${because}; ${stuck}.`,
            range: k.range,
            by: 'core',
            code: `eager-split:${k.reason}`,
          }
        }
        fix = `use ${read} inside the code that needs it`
      } else if (writtenWith(plan, k.syms, k.read)) {
        fix = `move ${moving([...names, read]).join(', ')} and the statements writing them to their own module`
      } else {
        const phrase = movePhrase([...names, read])
        fix = `${phrase[0]!.toLowerCase()}${phrase.slice(1)} to their own module`
      }
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
function annotationFrees(node: Node | null, purity: PurityContext): boolean {
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
      !annotationFrees(unit.node.init, purity)
    ) {
      return false
    }
    any = true
  }
  return any
}
