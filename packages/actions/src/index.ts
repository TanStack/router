// RouterAction is a constrained identify function that takes options: key, action, onSuccess, onError, onSettled, etc

import invariant from 'tiny-invariant'
import { Store } from '@tanstack/store'

export interface Register {
  // actionClient: ActionClient
}

export type RegisteredActionClient = Register extends {
  actionClient: ActionClient<infer TAction, infer TContext, infer TActions>
}
  ? ActionClient<TAction, TContext, TActions>
  : ActionClient

export type RegisteredActions = Register extends {
  actionClient: ActionClient<infer TActions, any, any>
}
  ? TActions
  : Action

export type RegisteredActionsByKey = Register extends {
  actionClient: ActionClient<infer TAction, any, any>
}
  ? ActionsToRecord<TAction>
  : Record<string, Action>

export type AnyAction = Action<any, any, any, any, any>

export type ActionClientOptions<
  TAction extends AnyAction,
  TContext = unknown,
> = {
  actions: TAction[]
  defaultMaxAge?: number
  defaultGcMaxAge?: number
} & (undefined extends TContext
  ? { context?: TContext }
  : { context: TContext })

export type ActionClientStore = Store<ActionClientState>

export type ActionClientState = {
  isSubmitting?: SubmissionState[]
  actions: Record<string, ActionState>
}

export interface ActionState<
  TKey extends string = string,
  TVariables = unknown,
  TResponse = unknown,
  TError = Error,
> {
  key: TKey
  submissions: SubmissionState<TVariables, TResponse, TError>[]
  latestSubmission?: SubmissionState<TVariables, TResponse, TError>
  pendingSubmissions: SubmissionState<TVariables, TResponse, TError>[]
}

export type ActionFn<TActionVariables = unknown, TActionResponse = unknown> = (
  submission: TActionVariables,
) => TActionResponse | Promise<TActionResponse>

export interface SubmissionState<
  TVariables = unknown,
  TResponse = unknown,
  TError = Error,
> {
  submittedAt: number
  status: 'pending' | 'success' | 'error'
  variables: undefined extends TVariables ? undefined : TVariables
  response?: TResponse
  error?: TError
}

export type ActionsToRecord<U extends AnyAction> = {
  [E in U as E['options']['key']]: E
}

export class ActionContext<TContext> {
  constructor() {}

  createAction = <TKey extends string, TVariables, TResponse, TError>(
    options: ActionOptions<TKey, TVariables, TResponse, TError, TContext>,
  ) => {
    return new Action<TKey, TVariables, TResponse, TError, TContext>(options)
  }

  createClient = <TActions extends AnyAction>(
    options: ActionClientOptions<TActions, TContext>,
  ) => {
    return new ActionClient<TActions, TContext>(options)
  }
}

// A action client that tracks instances of actions by unique key like react query
export class ActionClient<
  _TActions extends AnyAction = Action,
  TContext = unknown,
  TActions extends Record<string, AnyAction> = ActionsToRecord<_TActions>,
> {
  options: ActionClientOptions<_TActions, TContext>
  actions: TActions
  __store: ActionClientStore
  state: ActionClientStore['state']

  constructor(options: ActionClientOptions<_TActions, TContext>) {
    this.options = options
    this.__store = new Store(
      {
        actions: options.actions.reduce((acc, action) => {
          return {
            ...acc,
            [action.options.key]: {
              submissions: [],
              pendingSubmissions: [],
            },
          }
        }, {}),
      },
      {
        onUpdate: () => {
          this.__store.state = this.#resolveState(this.__store.state)
          this.state = this.__store.state
        },
      },
    ) as ActionClientStore
    this.state = this.__store.state
    this.actions = {} as any

    Object.values(this.options.actions).forEach((action: Action) => {
      ;(this.actions as any)[action.options.key] = action
    })
  }

  #resolveState = (state: ActionClientState): ActionClientState => {
    Object.keys(state.actions).forEach((key) => {
      let action = state.actions[key]!
      const latestSubmission = action.submissions[action.submissions.length - 1]
      const pendingSubmissions = action.submissions.filter(
        (d) => d.status === 'pending',
      )

      // Only update if things have changed
      if (latestSubmission !== action.latestSubmission) {
        action = {
          ...action,
          latestSubmission,
        }
      }

      // Only update if things have changed
      if (
        pendingSubmissions.map((d) => d.submittedAt).join('-') !==
        action.pendingSubmissions.map((d) => d.submittedAt).join('-')
      ) {
        action = {
          ...action,
          pendingSubmissions,
        }
      }

      state.actions[key] = action
    })

    return state
  }

  clearAll = () => {
    this.__store.batch(() => {
      Object.keys(this.actions).forEach((key) => {
        this.clearAction({ key })
      })
    })
  }

  clearAction = <TKey extends keyof TActions>(opts: { key: TKey }) => {
    this.#setAction(opts, (s) => {
      return {
        ...s,
        submissions: s.submissions.filter((d) => d.status == 'pending'),
      }
    })
  }

  submitAction = async <
    TKey extends keyof TActions,
    TAction extends TActions[TKey],
  >(
    opts: {
      key: TKey
    } & (undefined extends TAction['__types']['variables']
      ? { variables?: TAction['__types']['variables'] }
      : { variables: TAction['__types']['variables'] }),
  ): Promise<TAction['__types']['response']> => {
    return this.#submitAction(opts as any)
  }

  #setAction = async <TKey extends keyof TActions>(
    opts: {
      key: TKey
    },
    updater: (action: ActionState) => ActionState,
  ) => {
    this.__store.setState((s) => {
      const action = s.actions[opts.key as any] ?? createAction(opts)

      return {
        ...s,
        actions: {
          ...s.actions,
          [opts.key]: updater(action),
        },
      }
    })
  }

  #setSubmission = async <TKey extends keyof TActions>(
    opts: {
      key: TKey
      submittedAt: number
    },
    updater: (submission: SubmissionState) => SubmissionState,
  ) => {
    this.#setAction(opts, (s) => {
      const submission = s.submissions.find(
        (d) => d.submittedAt === opts.submittedAt,
      )

      invariant(submission, 'Could not find submission in action store')

      return {
        ...s,
        submissions: s.submissions.map((d) =>
          d.submittedAt === opts.submittedAt ? updater(d) : d,
        ),
      }
    })
  }

  #getIsLatestSubmission = <TKey extends keyof TActions>(opts: {
    key: TKey
    submittedAt: number
  }) => {
    const action = this.state.actions[opts.key as any]
    return action?.latestSubmission?.submittedAt === opts.submittedAt
  }

  #submitAction = async <
    TKey extends keyof TActions,
    TAction extends TActions[TKey],
  >(
    opts: {
      key: TKey
    } & (undefined extends TAction['__types']['variables']
      ? { variables?: TAction['__types']['variables'] }
      : { variables: TAction['__types']['variables'] }),
  ) => {
    const action = this.actions[opts.key]

    invariant(action, `Could not find action with key ${opts.key as string}`)

    const submittedAt = Date.now()

    const submission: SubmissionState<
      TAction['__types']['variables'],
      TAction['__types']['response'],
      TAction['__types']['error']
    > = {
      submittedAt,
      status: 'pending',
      variables: opts.variables as any,
    }

    this.#setAction(opts, (s) => {
      let submissions = [...s.submissions, submission]
      submissions.reverse()
      submissions = submissions.slice(0, action.options.maxSubmissions ?? 10)
      submissions.reverse()

      return {
        ...s,
        submissions,
      }
    })

    const after = async () => {
      action.options.onEachSettled?.({
        submission,
        context: this.options.context,
      })
      if (this.#getIsLatestSubmission({ ...opts, submittedAt }))
        await action.options.onLatestSettled?.({
          submission,
          context: this.options.context,
        })
    }

    try {
      const res = await action.options.fn?.(submission.variables, {
        context: this.options.context,
      })
      this.#setSubmission({ ...opts, submittedAt }, (s) => ({
        ...s,
        response: res,
      }))
      await action.options.onEachSuccess?.({
        submission,
        context: this.options.context,
      })
      if (this.#getIsLatestSubmission({ ...opts, submittedAt }))
        await action.options.onLatestSuccess?.({
          submission,
          context: this.options.context,
        })
      await after()
      this.#setSubmission({ ...opts, submittedAt }, (s) => ({
        ...s,
        status: 'success',
      }))
      return res
    } catch (err: any) {
      console.error(err)
      this.#setSubmission({ ...opts, submittedAt }, (s) => ({
        ...s,
        error: err,
      }))
      await action.options.onEachError?.({
        submission,
        context: this.options.context,
      })
      if (this.#getIsLatestSubmission({ ...opts, submittedAt }))
        await action.options.onLatestError?.({
          submission,
          context: this.options.context,
        })
      await after()
      this.#setSubmission({ ...opts, submittedAt }, (s) => ({
        ...s,
        status: 'error',
      }))
      throw err
    }
  }
}

export interface ActionOptions<
  TKey extends string = string,
  TVariables = unknown,
  TResponse = unknown,
  TError = Error,
  TContext = unknown,
> {
  key: TKey
  fn: (
    variables: TVariables,
    opts: { context: TContext },
  ) => TResponse | Promise<TResponse>
  onLatestSuccess?: ActionCallback<TVariables, TResponse, TError, TContext>
  onEachSuccess?: ActionCallback<TVariables, TResponse, TError, TContext>
  onLatestError?: ActionCallback<TVariables, TResponse, TError, TContext>
  onEachError?: ActionCallback<TVariables, TResponse, TError, TContext>
  onLatestSettled?: ActionCallback<TVariables, TResponse, TError, TContext>
  onEachSettled?: ActionCallback<TVariables, TResponse, TError, TContext>
  maxSubmissions?: number
  debug?: boolean
}

export type ActionCallback<TVariables, TResponse, TError, TContext> = (opts: {
  submission: SubmissionState<TVariables, TResponse, TError>
  context: TContext
}) => void | Promise<void>

export class Action<
  TKey extends string = string,
  TVariables = unknown,
  TResponse = unknown,
  TError = Error,
  TContext = unknown,
> {
  __types!: {
    key: TKey
    variables: TVariables
    response: TResponse
    error: TError
    context: TContext
  }

  constructor(
    public options: ActionOptions<
      TKey,
      TVariables,
      TResponse,
      TError,
      TContext
    >,
  ) {}
}

export function createAction<
  TKey extends string = string,
  TVariables = unknown,
  TResponse = unknown,
  TError = Error,
>(opts: { key: any }): ActionState<TKey, TVariables, TResponse, TError> {
  return {
    key: opts.key,
    submissions: [],
    pendingSubmissions: [],
  }
}
