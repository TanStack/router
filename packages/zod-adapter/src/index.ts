import * as z3 from 'zod/v3'
import * as z4 from 'zod/v4'
import type { ValidatorAdapter } from '@tanstack/react-router'

export interface ZodTypeLike {
  _input: any
  _output: any
  parse: (input: any) => any
}

export type InputOutputOption = 'input' | 'output'

export interface zodValidatorOptions {
  readonly schema: ZodTypeLike
  readonly input?: InputOutputOption
  readonly output?: InputOutputOption
}

export type zodValidatorInput<
  TOptions extends ZodTypeLike | zodValidatorOptions,
> = TOptions extends zodValidatorOptions
  ? 'input' extends TOptions['input']
    ? TOptions['schema']['_input']
    : TOptions['schema']['_output']
  : TOptions extends ZodTypeLike
    ? TOptions['_input']
    : never

export type zodValidatorOutput<
  TOptions extends ZodTypeLike | zodValidatorOptions,
> = TOptions extends zodValidatorOptions
  ? 'output' extends TOptions['output']
    ? TOptions['schema']['_output']
    : TOptions['schema']['_input']
  : TOptions extends ZodTypeLike
    ? TOptions['_output']
    : never

export type zodValidatorAdapter<
  TOptions extends ZodTypeLike | zodValidatorOptions,
> = ValidatorAdapter<zodValidatorInput<TOptions>, zodValidatorOutput<TOptions>>

export const zodValidator = <
  TOptions extends ZodTypeLike | zodValidatorOptions,
>(
  options: TOptions,
): zodValidatorAdapter<TOptions> => {
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

const isZod4Schema = (
  schema: z3.ZodTypeAny | z4.ZodType,
): schema is z4.ZodType => {
  return (
    '_zod' in schema && typeof schema._zod === 'object' && 'def' in schema._zod
  )
}

export function fallback<TSchema extends z3.ZodTypeAny>(
  schema: TSchema,
  fallback: TSchema['_input'],
): z3.ZodPipeline<
  z3.ZodType<TSchema['_input'], z3.ZodTypeDef, TSchema['_input']>,
  z3.ZodCatch<TSchema>
>
export function fallback<TSchema extends z4.ZodType>(
  schema: TSchema,
  fallback: z4.input<TSchema>,
): z4.ZodPipe<
  z4.ZodType<TSchema['_zod']['input'], TSchema['_zod']['input']>,
  z4.ZodCatch<TSchema>
>
export function fallback<TSchema extends z3.ZodTypeAny | z4.ZodType>(
  schema: TSchema,
  fallback: any,
): any {
  if (isZod4Schema(schema)) {
    return z4.custom().pipe(schema.catch(fallback))
  } else {
    return z3.custom().pipe(schema.catch(fallback))
  }
}
