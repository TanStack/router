import {
  Command,
  createOption,
  InvalidArgumentError,
  type Option,
} from '@commander-js/extra-typings'
import invariant from 'tiny-invariant'
import { z, ZodObject } from 'zod'

// CLI Arg helper types - to infer the name and type of options in isolation without
// being in a Command class
// https://github.com/commander-js/extra-typings/blob/main/index.d.ts

type CamelCase<S extends string> = S extends `${infer W}-${infer Rest}`
  ? CamelCase<`${W}${Capitalize<Rest>}`>
  : S

type ConvertFlagToName<Flag extends string> = Flag extends `--no-${infer Name}`
  ? CamelCase<Name>
  : Flag extends `--${infer Name}`
    ? CamelCase<Name>
    : Flag extends `-${infer Name}`
      ? CamelCase<Name>
      : never

type TrimFlag<TFlag extends string> =
  TFlag extends `${infer TStart} ${infer TEnd}` ? TStart : TFlag

export type OptionType<TOption extends Option> =
  TOption extends Option<any, any, any, infer OptionType> ? OptionType : never

export type OptionName<TOption extends Option> =
  TOption extends Option<infer TFlag>
    ? ConvertFlagToName<TrimFlag<TFlag>>
    : never

export type OptionsArrayToRecord<TOptions extends ReadonlyArray<Option>> =
  Prettify<{
    [TOption in TOptions[number] as OptionName<TOption>]: OptionType<TOption>
  }>

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

// Validation function types

export type ValidateIssue = {
  module: string
  message: string
}

export type ValidateResult =
  | {
      success: true
    }
  | {
      success: false
      issues: Array<ValidateIssue>
    }

export type Diff =
  | {
      status: 'success'
      absolutePath: string
      relativePath: string
      changeDescription: string
    }
  | {
      status: 'error' | 'warning'
      absolutePath: string
      relativePath: string
      changeDescription: string
      message: string
    }

type ValidateFnParams<TSchema extends ZodObject<any, any, any>> = {
  config: z.infer<TSchema>
  targetPath: string
}

type ValidateFn<TSchema extends ZodObject<any, any, any>> = (
  opts: ValidateFnParams<TSchema>,
) => Promise<Array<string>>

export const createValidateFn = <
  TSchema extends ZodObject<any, any, any> = ZodObject<any, any, any>,
>({
  validate,
  schema,
}: {
  schema: TSchema
  validate: ValidateFn<TSchema>
}): ValidateFn<TSchema> => {
  // return apply

  return (async ({ config, targetPath }: ValidateFnParams<TSchema>) => {
    schema.parse(config)
    const result = await validate({
      config,
      targetPath,
    })
    if (result.length > 0) return result
    return validate({ config, targetPath })
  }) as ValidateFn<TSchema>
}

type ApplyFnParams<TSchema extends ZodObject<any, any, any>> = {
  config: z.infer<TSchema>
  targetPath: string
}

type ApplyFn<TSchema extends ZodObject<any, any, any>> = (
  opts: ApplyFnParams<TSchema>,
) => Promise<void>

export const createApplyFn = <
  TSchema extends ZodObject<any, any, any> = ZodObject<any, any, any>,
>({
  apply,
  schema,
}: {
  schema: TSchema
  apply: ApplyFn<TSchema>
}): ApplyFn<TSchema> => {
  // return apply

  return (async ({ config, targetPath }: ApplyFnParams<TSchema>) => {
    schema.parse(config)
    return apply({ config, targetPath })
  }) as ApplyFn<TSchema>
}

type InitFn<TSchema> =
  TSchema extends ZodObject<any, any, any>
    ? () => Promise<z.infer<TSchema>>
    : never

export const createInitFn = <
  TSchema extends ZodObject<any, any, any> = ZodObject<any, any, any>,
>(config: {
  schema: TSchema
  fn: InitFn<TSchema>
}) => {
  return config.fn
}

type PromptsFn<TSchema, TCliOptionsArray> =
  TSchema extends ZodObject<any, any, any>
    ? TCliOptionsArray extends ReadonlyArray<Option>
      ? (
          opts: OptionsArrayToRecord<TCliOptionsArray>,
        ) => Promise<z.infer<TSchema>>
      : () => Promise<z.infer<TSchema>>
    : never

export const createPromptFn = <
  TSchema extends ZodObject<any, any, any> = ZodObject<any, any, any>,
  TCliOptionsArray extends ReadonlyArray<Option> = [],
>(config: {
  schema: TSchema
  cliOptionsArray?: TCliOptionsArray
  fn: PromptsFn<TSchema, TCliOptionsArray>
}) => {
  return config.fn
}

export function createModule<
  TSchema extends ZodObject<any, any, any> = ZodObject<any, any, any>,
  TCommand extends Command = Command,
  TCliOptions extends ReadonlyArray<Option> = [],
  TPromptsFn extends PromptsFn<TSchema, TCliOptions> = PromptsFn<
    TSchema,
    TCliOptions
  >,
  TApplyFn extends ApplyFn<TSchema> = ApplyFn<TSchema>,
  TValidateFn extends ValidateFn<TSchema> = ValidateFn<TSchema>,
>({
  schema,
  command,
  cliOptions,
  promptsFn,
  applyFn,
  validateFn,
}: {
  schema: TSchema
  command?: TCommand
  cliOptions?: TCliOptions
  promptsFn?: TPromptsFn
  applyFn?: TApplyFn
  validateFn?: TValidateFn
}) {
  return {
    schema,
    command,
    cliOptions,
    promptsFn,
    applyFn,
    validateFn,
  }
}
