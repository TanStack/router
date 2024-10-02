import type { SearchSchemaInput } from './route'

export interface ValidatorObj<TInput, TOutput> {
  parse: ValidatorFn<TInput, TOutput>
}

export type AnyValidatorObj = ValidatorObj<any, any>

export interface ValidatorAdapter<TInput, TOutput> {
  types: {
    input: TInput
    output: TOutput
  }
  parse: (input: unknown) => TOutput
}

export type AnyValidatorAdapter = ValidatorAdapter<any, any>

export type AnyValidatorFn = ValidatorFn<any, any>

export type ValidatorFn<TInput, TOutput> = (input: TInput) => TOutput

export type Validator<TInput, TOutput> =
  | ValidatorObj<TInput, TOutput>
  | ValidatorFn<TInput, TOutput>
  | ValidatorAdapter<TInput, TOutput>
  | undefined

export type AnyValidator = Validator<any, any>

export type AnySchema = {}

export type DefaultValidator = Validator<Record<string, unknown>, AnySchema>

export type ResolveValidatorInputFn<TValidator> = TValidator extends (
  input: infer TSchemaInput,
) => any
  ? TSchemaInput extends SearchSchemaInput
    ? Omit<TSchemaInput, keyof SearchSchemaInput>
    : ResolveValidatorOutputFn<TValidator>
  : AnySchema

export type ResolveValidatorInput<TValidator> =
  TValidator extends AnyValidatorAdapter
    ? TValidator['types']['input']
    : TValidator extends AnyValidatorObj
      ? ResolveValidatorInputFn<TValidator['parse']>
      : ResolveValidatorInputFn<TValidator>

export type ResolveValidatorOutputFn<TValidator> = TValidator extends (
  ...args: any
) => infer TSchema
  ? TSchema
  : AnySchema

export type ResolveValidatorOutput<TValidator> = unknown extends TValidator
  ? TValidator
  : TValidator extends AnyValidatorAdapter
    ? TValidator['types']['output']
    : TValidator extends AnyValidatorObj
      ? ResolveValidatorOutputFn<TValidator['parse']>
      : ResolveValidatorOutputFn<TValidator>
