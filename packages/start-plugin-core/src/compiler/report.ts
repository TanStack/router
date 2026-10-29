/**
 * Start's reporting of a compile's diagnostics, the same in every host
 * (`reportCompileDiagnostics`: errors from every compile, warnings once per
 * file, reason and wording per run).
 */
import { reportCompileDiagnostics } from '@tanstack/router-utils/compiler'
import { namesStartSpecifier } from './recognizer'
import type {
  CompileOutput,
  DiagnosticSink,
  WarningLedger,
} from '@tanstack/router-utils/compiler'

export function reportStartDiagnostics(
  out: CompileOutput,
  file: string,
  code: string,
  envType: 'client' | 'server',
  ledger: WarningLedger,
  sink: DiagnosticSink,
): void {
  reportCompileDiagnostics(out.diagnostics, file, code, ledger, sink, (d) =>
    // A module the compiler cannot parse is left as it is when it names no
    // Start package: the bundler's own parser reports a syntax error at the
    // user's position, and a script no ESM parse accepts (a CommonJS
    // dependency with a top-level `return`) is nothing the compiler touches
    // (J4.16, SPEC §5.15). One that names a Start package may define server
    // code (a handler, a server-only route option): the client build fails
    // naming the file (never shipped untransformed, J4.12); a server build
    // warns.
    namesStartSpecifier(code)
      ? {
          severity: envType === 'client' ? 'error' : 'warning',
          message: `[tanstack-start] The compiler cannot parse "${file}", which uses a TanStack Start or Router API, so it cannot compile its server code: ${d.message}`,
          range: d.range,
          by: 'parse',
          code: 'parse',
        }
      : null,
  )
}
