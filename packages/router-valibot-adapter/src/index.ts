import { parse } from 'valibot'
import type { ValidatorAdapter } from '@tanstack/react-router'
import type { GenericSchema } from 'valibot'

export type ValibotValidatorAdapter<TOptions extends GenericSchema> =
  ValidatorAdapter<
    NonNullable<TOptions['_types']>['input'],
    NonNullable<TOptions['_types']>['output']
  >

export const valibotSearchValidator = <TOptions extends GenericSchema>(
  options: TOptions,
): ValibotValidatorAdapter<TOptions> => {
  return {
    types: {
      input: options._types?.input,
      output: options._types?.output,
    },
    parse: (input) => parse(options, input),
  }
}
