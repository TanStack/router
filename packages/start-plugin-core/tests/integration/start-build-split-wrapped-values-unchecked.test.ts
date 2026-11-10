/**
 * Split route option values in type wrappers, with the compiler's
 * self-checks off, as in users' builds (`split-wrapped-values-cases.ts`):
 * a compile the self-checks would refuse builds there, so what reaches the
 * client is the only evidence. The switch is read once, when the compiler
 * loads: this file runs in a process of its own (project
 * `integration-alone`) and turns it off before anything loads.
 */
import { vi } from 'vitest'
import { splitWrappedValueTests } from './split-wrapped-values-cases'

vi.hoisted(() => {
  process.env.TSR_COMPILER_VERIFY = '0'
})

splitWrappedValueTests()
