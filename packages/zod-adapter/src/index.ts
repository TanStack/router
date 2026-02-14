import * as z3 from 'zod/v3'
import * as z4 from 'zod/v4/core'
import * as z4m from 'zod/v4/mini'
import type { ValidatorAdapter } from '@tanstack/react-router'

export interface ZodTypeLike {
  _input: any
  _output: any
  parse: (input: any) => any
}

export type AnyZodSchema = ZodTypeLike | z4.$ZodType

export type InputOutputOption = 'input' | 'output'

export interface zodValidatorOptions {
  readonly schema: AnyZodSchema
  readonly input?: InputOutputOption
  readonly output?: InputOutputOption
}

type ExtractInput<T> = T extends z4.$ZodType
  ? z4.input<T>
  : T extends ZodTypeLike
    ? T['_input']
    : never

type ExtractOutput<T> = T extends z4.$ZodType
  ? z4.output<T>
  : T extends ZodTypeLike
    ? T['_output']
    : never

export type zodValidatorInput<
  TOptions extends AnyZodSchema | zodValidatorOptions,
> = TOptions extends zodValidatorOptions
  ? 'input' extends TOptions['input']
    ? ExtractInput<TOptions['schema']>
    : ExtractOutput<TOptions['schema']>
  : ExtractInput<TOptions>

export type zodValidatorOutput<
  TOptions extends AnyZodSchema | zodValidatorOptions,
> = TOptions extends zodValidatorOptions
  ? 'output' extends TOptions['output']
    ? ExtractOutput<TOptions['schema']>
    : ExtractInput<TOptions['schema']>
  : ExtractOutput<TOptions>

export type zodValidatorAdapter<
  TOptions extends AnyZodSchema | zodValidatorOptions,
> = ValidatorAdapter<zodValidatorInput<TOptions>, zodValidatorOutput<TOptions>>

function isZod4Schema(schema: unknown): schema is z4.$ZodType {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_zod' in schema
  )
}

function parseSchema(schema: AnyZodSchema, data: unknown): unknown {
  if (isZod4Schema(schema)) {
    return z4.parse(schema, data)
  }
  return schema.parse(data)
}

export const zodValidator = <
  TOptions extends AnyZodSchema | zodValidatorOptions,
>(
  options: TOptions,
): zodValidatorAdapter<TOptions> => {
  const input = 'input' in options ? options.input : 'input'
  const output = 'output' in options ? options.output : 'output'
  const schema: AnyZodSchema =
    'schema' in options && !isZod4Schema(options)
      ? options.schema
      : options
  const _input = '_input' in schema ? schema._input : undefined
  const _output = '_output' in schema ? schema._output : undefined
  return {
    types: {
      input: input === 'output' ? _output : _input,
      output: output === 'input' ? _input : _output,
    },
    parse: (input: unknown) => parseSchema(schema, input),
  } as zodValidatorAdapter<TOptions>
}

export const fallback = <TSchema extends z3.ZodTypeAny>(
  schema: TSchema,
  fallback: TSchema['_input'],
): z3.ZodPipeline<
  z3.ZodType<TSchema['_input'], z3.ZodTypeDef, TSchema['_input']>,
  z3.ZodCatch<TSchema>
> => {
  return z3.custom<TSchema['_input']>().pipe(schema.catch(fallback))
}
