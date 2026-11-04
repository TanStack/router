/**
 * Vue single-file components in the late pass (`@vitejs/plugin-vue`,
 * vue-loader): the refusals of code the Vue compiler generates.
 *
 * In development, and in builds with Vue's devtools, compiler-sfc does not
 * inline a `<script setup>` block's template: it hands every binding the
 * block declares to the template through an object it generates
 * (`const __returned__ = { fn, get createServerFn() { … } }`), in JavaScript
 * every import too. A builder or factory there is refused, rightly (the
 * template can attach server code to it). That refusal's position is in the
 * generated object, which the SFC does not have: the report is moved to the
 * binding's declaration in the SFC, named, with how to avoid it. An escape
 * the author wrote (its position maps to the SFC) keeps its report. A
 * server fn that cannot be hoisted gets what "the module top level" is in an
 * SFC.
 */
import { START_ENV } from '../planners'
import { Locator } from '../import-protection/locate'
import type { LateEscape, StartEnvFacts } from '../planners'
import type {
  CompileOutput,
  Diagnostic,
  DiagnosticPosition,
  DiagnosticSink,
  InputSourceMap,
} from '@tanstack/router-utils/compiler'

export function isVueSfc(file: string): boolean {
  return file.endsWith('.vue')
}

const RECIPE =
  'In development, and in builds with Vue’s devtools, a `<script setup>` block hands every binding it declares to its template, and in JavaScript every import too. Use `<script setup lang="ts">`, which hands over only the imports the template uses, and define builders, factories and middleware in a `.ts` module or a module-scope `<script lang="ts">` block; import the finished server functions into `<script setup>`.'

function generatedEscapeMessage(d: Diagnostic, name: string): string {
  const what =
    d.code === 'start-escape:namespace'
      ? `\`${name}\` is the namespace of a module that exports a TanStack Start builder or factory`
      : `\`${name}\` is a TanStack Start builder or factory`
  return `${what}, and the code Vue generates for this component hands it to the template, where the compiler cannot follow it, so server code attached to it there would ship to the client. ${RECIPE}`
}

const HOIST_HINT =
  ' In a Vue single-file component, the module top level is a `<script>` block next to `<script setup>` (with the same `lang`): define and export the server function there, or in a `.ts` module.'

/**
 * The diagnostics of a late compile of a Vue SFC as they are reported, and
 * the sink positions of those moved to the SFC; null when none changes.
 */
export function vueLateReport(
  out: CompileOutput,
  file: string,
  code: string,
  inputMap: () => InputSourceMap | null,
): {
  diagnostics: Array<Diagnostic>
  sink: (sink: DiagnosticSink) => DiagnosticSink
} | null {
  const facts = out.facts.planners[START_ENV] as StartEnvFacts | undefined
  const escapes = new Map<number, LateEscape>()
  for (const e of facts?.lateEscapes ?? []) {
    escapes.set(e.at, e)
  }
  const locator = new Locator(code, file, inputMap)
  const positions = new Map<Diagnostic, DiagnosticPosition>()
  const diagnostics = out.diagnostics.map((d) => {
    if (d.code === 'start-hoist') {
      return { ...d, message: d.message + HOIST_HINT }
    }
    const escape = d.range && escapes.get(d.range.start)
    if (!escape || locator.at(escape.at) !== null) {
      return d
    }
    // generated code hands the binding on: its declaration in the SFC
    const declared = locator.at(escape.declaration.start)
    if (declared === null || declared.file !== file) {
      return d
    }
    const moved: Diagnostic = {
      ...d,
      message: generatedEscapeMessage(d, escape.name),
    }
    positions.set(moved, { line: declared.line, column: declared.column - 1 })
    return moved
  })
  if (diagnostics.every((d, i) => d === out.diagnostics[i])) {
    return null
  }
  return {
    diagnostics,
    sink: (sink) => ({
      error: (d, at) => sink.error(d, positions.get(d) ?? at),
      warn: (d, at) => sink.warn(d, positions.get(d) ?? at),
    }),
  }
}
