import { parse } from 'valibot'
import type { SearchValidatorAdapter } from '@tanstack/react-router'
import type { GenericSchema, InferInput, InferOutput } from 'valibot'

export type ValibotSearchValidatorAdapter<TOptions extends GenericSchema> =
  SearchValidatorAdapter<InferInput<TOptions>, InferOutput<TOptions>>

export const valibotSearchValidator = <TOptions extends GenericSchema>(
  options: TOptions,
): ValibotSearchValidatorAdapter<TOptions> => {
  return {
    types: {
      input: null,
      output: null,
    },
    parse: (input) => parse(options, input),
  }
}
