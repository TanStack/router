import type { SearchSchemaInput, StateSchemaInput } from './route'

export interface StandardSchemaValidatorProps<TInput, TOutput> {
  readonly types?: StandardSchemaValidatorTypes<TInput, TOutput> | undefined
  readonly validate: AnyStandardSchemaValidate
}

export interface StandardSchemaValidator<TInput, TOutput> {
  readonly '~standard': StandardSchemaValidatorProps<TInput, TOutput>
}

export type AnyStandardSchemaValidator = StandardSchemaValidator<any, any>

export interface StandardSchemaValidatorTypes<TInput, TOutput> {
  readonly input: TInput
  readonly output: TOutput
}

export interface AnyStandardSchemaValidateSuccess {
  readonly value: any
  readonly issues?: undefined
}

export interface AnyStandardSchemaValidateFailure {
  readonly issues: ReadonlyArray<AnyStandardSchemaValidateIssue>
}

export interface AnyStandardSchemaValidateIssue {
  readonly message: string
}

export interface AnyStandardSchemaValidateInput {
  readonly value: any
}

export type AnyStandardSchemaValidate = (
  value: unknown,
) =>
  | (AnyStandardSchemaValidateSuccess | AnyStandardSchemaValidateFailure)
  | Promise<AnyStandardSchemaValidateSuccess | AnyStandardSchemaValidateFailure>

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
  | StandardSchemaValidator<TInput, TOutput>
  | undefined

export type AnyValidator = Validator<any, any>

export type AnySchema = {}

export type DefaultValidator = Validator<Record<string, unknown>, AnySchema>

export type ResolveSchemaValidatorInputFn<TValidator, TSchemaInput> =
  TValidator extends (input: infer TInferredInput) => any
    ? TInferredInput extends TSchemaInput
      ? Omit<TInferredInput, keyof TSchemaInput>
      : ResolveValidatorOutputFn<TValidator>
    : AnySchema

export type ResolveSearchValidatorInputFn<TValidator> =
  ResolveSchemaValidatorInputFn<TValidator, SearchSchemaInput>

export type ResolveStateValidatorInputFn<TValidator> =
  ResolveSchemaValidatorInputFn<TValidator, StateSchemaInput>

export type ResolveSearchValidatorInput<TValidator> =
  TValidator extends AnyStandardSchemaValidator
    ? NonNullable<TValidator['~standard']['types']>['input']
    : TValidator extends AnyValidatorAdapter
      ? TValidator['types']['input']
      : TValidator extends AnyValidatorObj
        ? ResolveSearchValidatorInputFn<TValidator['parse']>
        : ResolveSearchValidatorInputFn<TValidator>

export type ResolveStateValidatorInput<TValidator> =
  TValidator extends AnyStandardSchemaValidator
    ? NonNullable<TValidator['~standard']['types']>['input']
    : TValidator extends AnyValidatorAdapter
      ? TValidator['types']['input']
      : TValidator extends AnyValidatorObj
        ? ResolveStateValidatorInputFn<TValidator['parse']>
        : ResolveStateValidatorInputFn<TValidator>

export type ResolveValidatorInputFn<TValidator> = TValidator extends (
  input: infer TInput,
) => any
  ? TInput
  : undefined

export type ResolveValidatorInput<TValidator> =
  TValidator extends AnyStandardSchemaValidator
    ? NonNullable<TValidator['~standard']['types']>['input']
    : TValidator extends AnyValidatorAdapter
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
  : TValidator extends AnyStandardSchemaValidator
    ? NonNullable<TValidator['~standard']['types']>['output']
    : TValidator extends AnyValidatorAdapter
      ? TValidator['types']['output']
      : TValidator extends AnyValidatorObj
        ? ResolveValidatorOutputFn<TValidator['parse']>
        : ResolveValidatorOutputFn<TValidator>
