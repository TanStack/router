import { type SearchValidatorAdapter } from '@tanstack/react-router'
import { z } from 'zod'

export interface ZodTypeLike {
  _input: any
  _output: any
  parse: (input: any) => any
}

export type InputOutputOption = 'input' | 'output'

export interface ZodSearchValidatorOptions {
  readonly schema: ZodTypeLike
  readonly input?: InputOutputOption
  readonly output?: InputOutputOption
}

export type ZodSearchValidatorInput<
  TOptions extends ZodTypeLike | ZodSearchValidatorOptions,
> = TOptions extends ZodSearchValidatorOptions
  ? 'input' extends TOptions['input']
    ? TOptions['schema']['_input']
    : TOptions['schema']['_output']
  : TOptions extends ZodTypeLike
    ? TOptions['_input']
    : never

export type ZodSearchValidatorOutput<
  TOptions extends ZodTypeLike | ZodSearchValidatorOptions,
> = TOptions extends ZodSearchValidatorOptions
  ? 'output' extends TOptions['output']
    ? TOptions['schema']['_output']
    : TOptions['schema']['_input']
  : TOptions extends ZodTypeLike
    ? TOptions['_output']
    : never

export type ZodSearchValidatorAdapter<
  TOptions extends ZodTypeLike | ZodSearchValidatorOptions,
> = SearchValidatorAdapter<
  ZodSearchValidatorInput<TOptions>,
  ZodSearchValidatorOutput<TOptions>
>

export const zodSearchValidator = <
  TOptions extends ZodTypeLike | ZodSearchValidatorOptions,
>(
  options: TOptions,
): ZodSearchValidatorAdapter<TOptions> => {
  const input = 'input' in options ? options.input : 'input'
  const output = 'output' in options ? options.output : 'output'
  const _input = 'schema' in options ? options.schema._input : options._input
  const _output = 'schema' in options ? options.schema._output : options._output
  return {
    types: {
      input: input === 'output' ? _output : _input,
      output: output === 'input' ? _input : _output,
    },
    parse: (input) =>
      'schema' in options ? options.schema.parse(input) : options.parse(input),
  }
}

export const fallback = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  fallback: TSchema['_input'],
): z.ZodPipeline<
  z.ZodType<TSchema['_input'], z.ZodTypeDef, TSchema['_input']>,
  z.ZodCatch<TSchema>
> => {
  return z.custom<TSchema['_input']>().pipe(schema.catch(fallback))
}
