import { mkdir } from 'node:fs/promises'
import yoctoSpinner from 'yocto-spinner'
import {
  checkFolderExists,
  checkFolderIsEmpty,
} from './utils/helpers/base-utils'

import type { ZodObject, z } from 'zod'
import type { Spinner } from 'yocto-spinner'

type Schema = ZodObject<any, any, any>
type State<TSchema extends Schema> = Partial<z.infer<TSchema>>

type InitFn<TSchema extends ZodObject<any, any, any>> = (ctx: {
  cfg: State<TSchema>
  targetPath: string
}) => Promise<State<TSchema>> | State<TSchema>

type PromptFn<TSchema extends Schema> = (ctx: {
  state: State<TSchema>
  targetPath: string
}) => Promise<State<TSchema>> | State<TSchema>

type ValidateFn<TSchema extends Schema> = (ctx: {
  state: z.infer<TSchema>
  targetPath: string
}) => Promise<Array<string>> | Array<string>

type ApplyFn<TSchema extends Schema> = (ctx: {
  state: z.infer<TSchema>
  targetPath: string
}) => Promise<void>

type SpinnerOptions = {
  success: string
  error: string
  inProgress: string
}

type SpinnerConfigFn<TSchema extends Schema> = (ctx: {
  state: z.infer<TSchema>
}) => SpinnerOptions | undefined

export class Module<
  TSchema extends Schema,
  TInitFn extends InitFn<TSchema> | undefined = undefined,
  TPromptFn extends PromptFn<TSchema> | undefined = undefined,
  TValidateFn extends ValidateFn<TSchema> | undefined = undefined,
  TApplyFn extends ApplyFn<TSchema> | undefined = undefined,
  TSpinnerConfig extends SpinnerConfigFn<TSchema> | undefined = undefined,
> {
  public _schema: TSchema
  public _init: TInitFn
  public _prompt: TPromptFn
  private _validateFn: TValidateFn
  private _applyFn: TApplyFn
  private _spinnerConfig: TSpinnerConfig

  constructor({
    schema,
    initFn,
    promptFn,
    validateFn,
    applyFn,
    spinnerConfig,
  }: {
    schema: TSchema
    initFn?: TInitFn
    promptFn?: TPromptFn
    validateFn?: TValidateFn
    applyFn?: TApplyFn
    spinnerConfig?: TSpinnerConfig
  }) {
    this._schema = schema
    this._init = initFn as TInitFn
    this._prompt = promptFn as TPromptFn
    this._validateFn = validateFn as TValidateFn
    this._applyFn = applyFn as TApplyFn
    this._spinnerConfig = spinnerConfig as TSpinnerConfig
  }

  initFn<TInitFnNew extends InitFn<TSchema>>(fn: TInitFnNew) {
    return new Module<
      TSchema,
      TInitFnNew,
      TPromptFn,
      TValidateFn,
      TApplyFn,
      TSpinnerConfig
    >({
      schema: this._schema,
      initFn: fn,
      promptFn: this._prompt,
      validateFn: this._validateFn,
      applyFn: this._applyFn,
      spinnerConfig: this._spinnerConfig,
    })
  }

  promptFn<TPromptFnNew extends PromptFn<TSchema>>(fn: TPromptFnNew) {
    return new Module<
      TSchema,
      TInitFn,
      TPromptFnNew,
      TValidateFn,
      TApplyFn,
      TSpinnerConfig
    >({
      schema: this._schema,
      initFn: this._init,
      promptFn: fn,
      validateFn: this._validateFn,
      applyFn: this._applyFn,
      spinnerConfig: this._spinnerConfig,
    })
  }

  validateFn<TValidateFnNew extends ValidateFn<TSchema>>(fn: TValidateFnNew) {
    return new Module<
      TSchema,
      TInitFn,
      TPromptFn,
      TValidateFnNew,
      TApplyFn,
      TSpinnerConfig
    >({
      schema: this._schema,
      initFn: this._init,
      promptFn: this._prompt,
      validateFn: fn,
      applyFn: this._applyFn,
      spinnerConfig: this._spinnerConfig,
    })
  }

  applyFn<TApplyFnNew extends ApplyFn<TSchema>>(fn: TApplyFnNew) {
    return new Module<
      TSchema,
      TInitFn,
      TPromptFn,
      TValidateFn,
      TApplyFnNew,
      TSpinnerConfig
    >({
      schema: this._schema,
      initFn: this._init,
      promptFn: this._prompt,
      validateFn: this._validateFn,
      applyFn: fn,
      spinnerConfig: this._spinnerConfig,
    })
  }

  spinnerConfig<TSpinnerConfigNew extends SpinnerConfigFn<TSchema>>(
    fn: TSpinnerConfigNew,
  ) {
    return new Module<
      TSchema,
      TInitFn,
      TPromptFn,
      TValidateFn,
      TApplyFn,
      TSpinnerConfigNew
    >({
      schema: this._schema,
      initFn: this._init,
      promptFn: this._prompt,
      validateFn: this._validateFn,
      applyFn: this._applyFn,
      spinnerConfig: fn,
    })
  }

  async _execute({
    cfg,
    targetPath,
    type,
  }: {
    cfg: Partial<z.infer<TSchema>>
    targetPath: string
    type: 'new-project' | 'merge'
  }) {
    let state = { ...cfg }

    const targetExists = await checkFolderExists(targetPath)
    const targetIsEmpty = await checkFolderIsEmpty(targetPath)

    if (type === 'new-project') {
      if (targetExists && !targetIsEmpty) {
        console.error("The target folder isn't empty")
        process.exit(0)
      }
    }

    if (state.type === 'project-update') {
      if (!targetExists) {
        console.error("The target folder doesn't exist")
        process.exit(0)
      }
    }

    if (this._init) {
      state = await this._init({ cfg: state, targetPath })
    }

    if (this._prompt) {
      state = await this._prompt({ state, targetPath })
    }

    const issues = await this._validate({ state, targetPath })

    if (issues.length > 0) {
      console.error("Couldn't run the module. The following issues occured:")
      console.error(issues.join(', '))
      return
    }

    if (this._applyFn) {
      if (type === 'new-project') {
        runWithSpinner({
          spinnerOptions: {
            error: 'Could not create folder',
            inProgress: 'Creating folder',
            success: `Folder created`,
          },
          fn: async () => {
            await mkdir(targetPath, { recursive: true })
          },
        })
      }

      await this._applyFn({ state, targetPath })
    }
  }

  async _apply({
    state,
    targetPath,
  }: {
    state: z.infer<TSchema>
    targetPath: string
  }): Promise<void> {
    if (this._applyFn) {
      const applyFn = this._applyFn
      const spinnerOptions = this._spinnerConfig
        ? this._spinnerConfig({ state })
        : undefined
      await runWithSpinner({
        spinnerOptions,
        fn: async () => {
          await applyFn({ state, targetPath })
        },
      })
    }
  }

  async _validate({
    state,
    targetPath,
  }: {
    state: z.infer<TSchema>
    targetPath: string
  }): Promise<Array<string>> {
    const parsed = this._schema.safeParse(state)
    if (!parsed.success) {
      return parsed.error.issues.map((i) => `${i.path} => ${i.message}`)
    }

    if (this._validateFn) {
      const validateFnIssues = await this._validateFn({ state, targetPath })
      return validateFnIssues
    }

    return []
  }
}

export function createModule<TSchema extends Schema>(
  schema: TSchema,
): Module<TSchema> {
  return new Module<TSchema>({ schema })
}

const runWithSpinner = async ({
  spinnerOptions,
  fn,
}: {
  spinnerOptions: SpinnerOptions | undefined
  fn: () => Promise<void>
}) => {
  let spinner: Spinner

  if (spinnerOptions != undefined) {
    spinner = yoctoSpinner({
      text: spinnerOptions.inProgress,
    }).start()
  }

  try {
    await fn()
    if (spinnerOptions) {
      spinner!.success(spinnerOptions.success)
    }
  } catch (e) {
    if (spinnerOptions) {
      spinner!.error(spinnerOptions.error)
    }
    throw e
  }
}
