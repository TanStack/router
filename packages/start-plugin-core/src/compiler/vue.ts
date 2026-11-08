/**
 * Vue single-file components (`@vitejs/plugin-vue`, vue-loader): the
 * refusals of code the Vue compiler generates, worded for the SFC.
 *
 * In development, and in builds with Vue's devtools, compiler-sfc does not
 * inline a `<script setup>` block's template: it hands every binding the
 * block declares to the template through an object it generates
 * (`const __returned__ = { fn, get createServerFn() { … } }`), in JavaScript
 * every import too. A builder or factory there is refused, rightly (the
 * template can attach server code to it). That refusal's position is in the
 * generated object, which the SFC does not have: the report is moved to the
 * binding's declaration in the SFC, named, with how to avoid it. An escape
 * the author wrote (its position maps to the SFC) keeps its report.
 *
 * A `<script setup>` block's code runs inside the component's setup
 * function, so every server fn there is nested in a function: one that
 * cannot be hoisted is told so, with what the module top level is in an SFC.
 */
import { readFileSync } from 'node:fs'
import { START_ENV } from '../planners'
import { Locator } from '../import-protection/locate'
import type { LateEscape, StartEnvFacts, VueHoist } from '../planners'
import type {
  CompileOutput,
  Diagnostic,
  InputSourceMap,
} from '@tanstack/router-utils/compiler'

export function isVueSfc(file: string): boolean {
  return file.endsWith('.vue')
}

const RECIPE =
  'In development, and in builds with Vue’s devtools, a `<script setup>` block hands every binding it declares to its template, and in JavaScript every import too (a `<script>` block next to it hands over its bindings as well). Use `<script setup lang="ts">`, which hands over only the imports the template uses. Define builders, factories and middleware in a `.ts` module and import them, or the finished server functions you build from them. A `<script>` block can hold a server function written as one chain (`createServerFn().handler(…)`), but not a builder kept in a variable.'

function generatedEscapeMessage(d: Diagnostic, name: string): string {
  const what =
    d.code === 'start-escape:namespace'
      ? `\`${name}\` is the namespace of a module that exports a TanStack Start builder or factory`
      : `\`${name}\` is a TanStack Start builder or factory`
  return `${what}, and the code Vue generates for this component hands it to the template, where the compiler cannot follow it, so server code attached to it there would ship to the client. ${RECIPE}`
}

const SETUP =
  'In `<script setup>`, code runs inside the component’s setup function'

/** A refused nested server fn of a `<script setup>` block. */
function setupHoistMessage(d: Diagnostic, hoist: VueHoist): string {
  const reads = hoist.reads
  if (reads?.builder) {
    return `${SETUP}, so this server function is built on \`${reads.name}\`, a local of that function, and cannot be compiled. Define \`${reads.name}\` in a \`.ts\` module and import it, or write the server function as one chain: \`createServerFn().handler(…)\`.`
  }
  if (reads) {
    return `${SETUP}, so this server function reads \`${reads.name}\`, a local of that function, and cannot be compiled. Pass it in the server function's input instead: declare it with \`.validator()\` and call the server function with \`{ data: … }\`.`
  }
  if (hoist.option) {
    return `${SETUP}, and the compiler moves this server function out of it, so ${hoist.option} in its options would run when the module loads instead of when the component is set up, and the compiler cannot tell that it is free of side effects. Define the server function in a \`.ts\` module and import it.`
  }
  return `${d.message} ${SETUP}: define the server function in a \`.ts\` module and import it.`
}

const HOIST_HINT =
  ' In a Vue single-file component, the module top level is a `.ts` module you import, or a `<script>` block next to `<script setup>` (with the same `lang`) for server functions written as one chain (`createServerFn().handler(…)`).'

/**
 * The diagnostics of a compile of a Vue SFC's script as they are reported,
 * and the offsets of those moved elsewhere in the module (to the binding a
 * generated escape hands on); null when none changes.
 */
export function vueReport(
  out: CompileOutput,
  file: string,
  inputMap: () => InputSourceMap | null,
  locate: SfcLocate,
): {
  diagnostics: Array<Diagnostic>
  moved: Map<Diagnostic, number>
} | null {
  const facts = out.facts.planners[START_ENV] as StartEnvFacts | undefined
  const escapes = new Map<number, LateEscape>()
  for (const e of facts?.lateEscapes ?? []) {
    escapes.set(e.at, e)
  }
  const hoists = new Map<number, VueHoist>()
  for (const h of facts?.vueHoists ?? []) {
    hoists.set(h.at, h)
  }
  let setupLines: Array<[number, number]> | undefined
  const inScriptSetup = (offset: number) => {
    const at = locate(offset)
    if (at === null) {
      return false
    }
    setupLines ??= scriptSetupLines(sfcText(file, inputMap))
    return setupLines.some(([from, to]) => from <= at.line && at.line <= to)
  }
  const moved = new Map<Diagnostic, number>()
  const diagnostics = out.diagnostics.map((d) => {
    if (d.code === 'start-hoist') {
      const hoist = d.range && hoists.get(d.range.start)
      return {
        ...d,
        message:
          hoist && inScriptSetup(hoist.at)
            ? setupHoistMessage(d, hoist)
            : d.message + HOIST_HINT,
      }
    }
    const escape = d.range && escapes.get(d.range.start)
    if (!escape || locate(escape.at) !== null) {
      return d
    }
    // generated code hands the binding on: its declaration in the SFC
    if (locate(escape.declaration.start) === null) {
      return d
    }
    const report: Diagnostic = {
      ...d,
      message: generatedEscapeMessage(d, escape.name),
    }
    moved.set(report, escape.declaration.start)
    return report
  })
  if (diagnostics.every((d, i) => d === out.diagnostics[i])) {
    return null
  }
  return { diagnostics, moved }
}

/** The 1-based line and column in the SFC of an offset of its script's compiled code, or null. */
export type SfcLocate = (
  offset: number,
) => { line: number; column: number } | null

/**
 * Positions in the SFC of offsets of its script's compiled code. Through
 * the input map when there is one, with the column of the offset's
 * statement when the mapped line is that statement's text (a map of whole
 * lines: vue-loader in development). Without one (a production build's
 * Vue plugin makes none unless source maps are on), the statement's own
 * line when the SFC has that text once (Vue keeps a script's statements as
 * written; blanks, quotes and a trailing `;` aside, which a later
 * TypeScript transform may reprint); else no position.
 */
export function vueLocator(
  file: string,
  code: string,
  inputMap: () => InputSourceMap | null,
): SfcLocate {
  const locator = new Locator(code, file, inputMap)
  let sfc: Array<string> | undefined
  return (offset) => {
    if (offset < 0 || offset > code.length) {
      return null
    }
    sfc ??= sfcText(file, inputMap).split(/\r?\n/)
    const start = code.lastIndexOf('\n', offset - 1) + 1
    const end = code.indexOf('\n', offset)
    const line = code.slice(start, end === -1 ? code.length : end)
    const statement = squash(line)
    // the offset's place in its statement: the non-blank characters before it
    const before = squash(line.slice(0, offset - start)).length
    /** The 1-based column of the offset in SFC line `n`, its statement's line. */
    const columnIn = (n: number) => {
      const text = sfc![n - 1]!
      let seen = 0
      for (let i = 0; i < text.length; i++) {
        if (!/\s/.test(text[i]!)) {
          if (seen === before) {
            return i + 1
          }
          seen++
        }
      }
      return text.length + 1
    }
    const isStatement = (n: number) =>
      statement !== '' && squash(sfc![n - 1] ?? '') === statement
    if (inputMap() !== null) {
      const at = locator.at(offset)
      if (at === null || at.file !== file) {
        return null
      }
      return isStatement(at.line)
        ? { line: at.line, column: columnIn(at.line) }
        : { line: at.line, column: at.column }
    }
    const lines: Array<number> = []
    for (let n = 1; n <= sfc.length; n++) {
      if (isStatement(n)) {
        lines.push(n)
      }
    }
    return lines.length === 1
      ? { line: lines[0]!, column: columnIn(lines[0]!) }
      : null
  }
}

/** A line's text without blanks, quote styles or a trailing `;` (what tools after Vue may reprint). */
const squash = (text: string) =>
  text.replace(/\s+/g, '').replace(/"/g, "'").replace(/;$/, '')

/** The SFC's text the input map was made from (else the file's). */
function sfcText(file: string, inputMap: () => InputSourceMap | null): string {
  const map = inputMap()
  const index = map?.sources.findIndex(
    (s) => typeof s === 'string' && s.split('?')[0]!.endsWith('.vue'),
  )
  const content =
    index === undefined || index < 0 ? null : map?.sourcesContent?.[index]
  if (typeof content === 'string') {
    return content
  }
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** The 1-based line ranges of an SFC's `<script setup>` blocks. */
function scriptSetupLines(sfc: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const lineOf = (offset: number) => sfc.slice(0, offset).split('\n').length
  for (const m of sfc.matchAll(/<script\b[^>]*\bsetup\b[^>]*>/g)) {
    const close = sfc.indexOf('</script>', m.index + m[0].length)
    ranges.push([lineOf(m.index), lineOf(close === -1 ? sfc.length : close)])
  }
  return ranges
}
