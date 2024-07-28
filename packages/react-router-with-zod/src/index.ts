import { type SearchValidatorAdapter } from '@tanstack/react-router'
import { z } from 'zod'

export interface ZodTypeLike {
  _input: any
  _output: any
  parse: (input: any) => any
}

export type InputOutputOption = 'input' | 'output'

export interface ZodSearchValidatorOptions<
  T extends ZodTypeLike,
  TInput extends InputOutputOption,
  TOutput extends InputOutputOption,
> {
  readonly schema: T
  readonly input?: TInput
  readonly output?: TOutput
}

export type ZodSearchValidatorAdapter<
  T extends ZodTypeLike,
  TInput extends InputOutputOption,
  TOutput extends InputOutputOption,
> = SearchValidatorAdapter<
  'input' extends TInput ? T['_input'] : T['_output'],
  'output' extends TOutput ? T['_output'] : T['_input']
>

export const zodSearchValidator = <
  T extends ZodTypeLike,
  TInput extends InputOutputOption,
  TOutput extends InputOutputOption,
>(
  options: T | ZodSearchValidatorOptions<T, TInput, TOutput>,
): ZodSearchValidatorAdapter<T, TInput, TOutput> => {
  const input = 'input' in options ? options.input : 'input'
  const output = 'output' in options ? options.output : 'output'
  const schema = 'schema' in options ? options.schema : options
  return {
    types: {
      input: input === 'output' ? schema._output : schema._input,
      output: output === 'input' ? schema._input : schema._output,
    },
    parse: (input) => schema.parse(input),
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
