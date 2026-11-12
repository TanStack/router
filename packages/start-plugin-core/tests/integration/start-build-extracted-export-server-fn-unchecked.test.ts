/**
 * An exported value running a function that declares a server fn, with the
 * compiler's self-checks off, as in users' builds
 * (`extracted-export-server-fn-cases.ts`): a compile the self-checks would
 * refuse builds there, so what the pages render is the only evidence. The
 * switch is read once, when the compiler loads: this file runs in a
 * process of its own (project `integration-alone`) and turns it off before
 * anything loads.
 */
import { vi } from 'vitest'
import { extractedExportServerFnTests } from './extracted-export-server-fn-cases'

vi.hoisted(() => {
  process.env.TSR_COMPILER_VERIFY = '0'
})

extractedExportServerFnTests()
