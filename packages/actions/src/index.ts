// RouterAction is a constrained identify function that takes options: key, action, onSuccess, onError, onSettled, etc

import invariant from 'tiny-invariant'
import { Store } from '@tanstack/store'

export interface Register {
  // actionClient: ActionClient
}

export type RegisteredActionClient = Register extends {
  actionClient: ActionClient<infer TActions>
}
  ? ActionClient<TActions>
  : ActionClient

export type RegisteredActions = Register extends {
  actionClient: ActionClient<infer TActions>
}
  ? TActions
  : Action[]

export interface ActionClientOptions<
  TActions extends Action<any, any, any, any>[],
> {
  getActions: () => TActions
  defaultMaxAge?: number
  defaultGcMaxAge?: number
}

export type ActionClientStore = Store<{
  isSubmitting?: ActionSubmission[]
}>
// A action client that tracks instances of actions by unique key like react query
export class ActionClient<
  TActions extends Action<any, any, any, any>[] = Action[],
> {
  options: ActionClientOptions<TActions>
  actions: Record<string, Action>
  store: ActionClientStore
  state: ActionClientStore['state']

  initialized = false

  constructor(options: ActionClientOptions<TActions>) {
    this.options = options
    this.store = new Store(
      {},
      {
        onUpdate: (next) => {
          this.state = next
        },
      },
    ) as ActionClientStore
    this.state = this.store.state
    this.actions = {}
  }

  init = () => {
    this.options.getActions().forEach((action) => {
      action.client = this

      this.actions[action.key] = action
    })

    this.initialized = true
  }

  getAction<TKey extends TActions[number]['__types']['key']>(opts: {
    key: TKey
  }): ActionByKey<TActions, TKey> {
    if (!this.initialized) this.init()
    return this.actions[opts.key as any] as any
  }
}

export type ActionByKey<
  TActions extends Action<any, any, any, any>[],
  TKey extends TActions[number]['__types']['key'],
> = {
  [TAction in TActions[number] as number]: TAction extends {
    options: ActionOptions<TKey, infer TVariables, infer TData, infer TError>
  }
    ? Action<TKey, TVariables, TData, TError>
    : never
}[number]

export interface ActionOptions<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  key: TKey
  action: (payload: TPayload) => TResponse | Promise<TResponse>
  onLatestSuccess?: ActionCallback<TPayload, TResponse, TError>
  onEachSuccess?: ActionCallback<TPayload, TResponse, TError>
  onLatestError?: ActionCallback<TPayload, TResponse, TError>
  onEachError?: ActionCallback<TPayload, TResponse, TError>
  onLatestSettled?: ActionCallback<TPayload, TResponse, TError>
  onEachSettled?: ActionCallback<TPayload, TResponse, TError>
  maxSubmissions?: number
  debug?: boolean
}

export type ActionCallback<TPayload, TResponse, TError> = (
  submission: ActionSubmission<TPayload, TResponse, TError>,
) => void | Promise<void>

export type ResolvedActionState<TPayload, TResponse, TError> = ActionStore<
  TPayload,
  TResponse,
  TError
> & {
  latestSubmission?: ActionSubmission<TPayload, TResponse, TError>
  pendingSubmissions: ActionSubmission<TPayload, TResponse, TError>[]
}

export class Action<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  __types!: {
    key: TKey
    payload: TPayload
    response: TResponse
    error: TError
  }
  key: TKey
  client?: ActionClient<any>
  options: ActionOptions<TKey, TPayload, TResponse, TError>
  store: Store<ActionStore<TPayload, TResponse, TError>>
  state: ResolvedActionState<TPayload, TResponse, TError>

  constructor(options: ActionOptions<TKey, TPayload, TResponse, TError>) {
    this.store = new Store<ActionStore<TPayload, TResponse, TError>>(
      {
        submissions: [],
      },
      {
        onUpdate: (next) => {
          this.state = this.#resolveState(next)
        },
      },
    )
    this.state = this.#resolveState(this.store.state)
    this.options = options
    this.key = options.key
  }

  #resolveState = (
    state: ActionStore<TPayload, TResponse, TError>,
  ): ResolvedActionState<TPayload, TResponse, TError> => {
    const latestSubmission = state.submissions[state.submissions.length - 1]
    const pendingSubmissions = state.submissions.filter(
      (d) => d.status === 'pending',
    )

    return {
      ...state,
      latestSubmission,
      pendingSubmissions,
    }
  }

  clear = async () => {
    // await Promise.all(this.#promises)
    this.store.setState((s) => ({
      ...s,
      submissions: s.submissions.filter((d) => d.status !== 'pending'),
    }))
  }

  #promises: Promise<any>[] = []

  submit = async (payload?: TPayload): Promise<TResponse> => {
    const promise = this.#submit(payload)
    this.#promises.push(promise)

    const res = await promise
    this.#promises = this.#promises.filter((d) => d !== promise)
    return res
  }

  #submit = async (payload?: TPayload): Promise<TResponse> => {
    const submission: ActionSubmission<TPayload, TResponse, TError> = {
      submittedAt: Date.now(),
      status: 'pending',
      payload: payload as TPayload,
      invalidate: () => {
        setSubmission((s) => ({
          ...s,
          isInvalid: true,
        }))
      },
      getIsLatest: () =>
        this.store.state.submissions[this.store.state.submissions.length - 1]
          ?.submittedAt === submission.submittedAt,
    }

    const setSubmission = (
      updater: (
        submission: ActionSubmission<TPayload, TResponse, TError>,
      ) => ActionSubmission<TPayload, TResponse, TError>,
    ) => {
      this.store.setState((s) => {
        const a = s.submissions.find(
          (d) => d.submittedAt === submission.submittedAt,
        )

        invariant(a, 'Could not find submission in this.store')

        return {
          ...s,
          submissions: s.submissions.map((d) =>
            d.submittedAt === submission.submittedAt ? updater(d) : d,
          ),
        }
      })
    }

    this.store.setState((s) => {
      let submissions = [...s.submissions, submission]
      submissions.reverse()
      submissions = submissions.slice(0, this.options.maxSubmissions ?? 10)
      submissions.reverse()

      return {
        ...s,
        submissions,
      }
    })

    const after = async () => {
      this.options.onEachSettled?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestSettled?.(submission)
    }

    try {
      const res = await this.options.action?.(submission.payload)
      setSubmission((s) => ({
        ...s,
        response: res,
      }))
      await this.options.onEachSuccess?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestSuccess?.(submission)
      await after()
      setSubmission((s) => ({
        ...s,
        status: 'success',
      }))
      return res
    } catch (err: any) {
      console.error(err)
      setSubmission((s) => ({
        ...s,
        error: err,
      }))
      await this.options.onEachError?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestError?.(submission)
      await after()
      setSubmission((s) => ({
        ...s,
        status: 'error',
      }))
      throw err
    }
  }
}

export interface ActionStore<
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  submissions: ActionSubmission<TPayload, TResponse, TError>[]
}

export type ActionFn<TActionPayload = unknown, TActionResponse = unknown> = (
  submission: TActionPayload,
) => TActionResponse | Promise<TActionResponse>

export interface ActionSubmission<
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  submittedAt: number
  status: 'pending' | 'success' | 'error'
  payload: TPayload
  response?: TResponse
  error?: TError
  isInvalid?: boolean
  invalidate: () => void
  getIsLatest: () => boolean
}
