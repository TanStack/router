import { type SearchValidatorAdapter } from '@tanstack/react-router'
import { type GenericSchema, parse } from 'valibot'

export type ValibotSearchValidatorAdapter<TOptions extends GenericSchema> =
  SearchValidatorAdapter<
    NonNullable<TOptions['_types']>['input'],
    NonNullable<TOptions['_types']>['output']
  >

export const valibotSearchValidator = <TOptions extends GenericSchema>(
  options: TOptions,
): ValibotSearchValidatorAdapter<TOptions> => {
  return {
    types: {
      input: options._types?.input,
      output: options._types?.output,
    },
    parse: (input) => parse(options, input),
  }
}
