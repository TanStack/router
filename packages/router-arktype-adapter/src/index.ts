import { type SearchValidatorAdapter } from '@tanstack/react-router'

export interface ArkTypeLike {
  infer: any
  inferIn: any
  assert: (input: any) => any
}

export type ArkTypeSearchValidatorAdapter<TOptions extends ArkTypeLike> =
  SearchValidatorAdapter<TOptions['inferIn'], TOptions['infer']>

export const arkTypeSearchValidator = <TOptions extends ArkTypeLike>(
  options: TOptions,
): ArkTypeSearchValidatorAdapter<TOptions> => {
  return {
    types: {
      input: options.inferIn,
      output: options.infer,
    },
    parse: (input) => options.assert(input),
  }
}
