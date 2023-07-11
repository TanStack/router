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
  : Record<string, Action>

export type AnyAction = Action<any, any, any, any>

export interface ActionClientOptions<
  TActions extends Record<string, AnyAction>,
> {
  getActions: () => TActions
  defaultMaxAge?: number
  defaultGcMaxAge?: number
}

export type ActionClientStore = Store<{
  isSubmitting?: ActionSubmission[]
}>

type ResolveActions<TAction extends Record<string, AnyAction>> = {
  [TKey in keyof TAction]: TAction[TKey] extends Action<
    infer _,
    infer TVariables,
    infer TData,
    infer TError
  >
    ? Action<_, TVariables, TData, TError>
    : Action
}

// A action client that tracks instances of actions by unique key like react query
export class ActionClient<
  _TActions extends Record<string, AnyAction> = Record<string, Action>,
  TActions extends ResolveActions<_TActions> = ResolveActions<_TActions>,
> {
  options: ActionClientOptions<_TActions>
  actions: TActions
  __store: ActionClientStore
  state: ActionClientStore['state']

  initialized = false

  constructor(options: ActionClientOptions<_TActions>) {
    this.options = options
    this.__store = new Store(
      {},
      {
        onUpdate: () => {
          this.state = this.__store.state
        },
      },
    ) as ActionClientStore
    this.state = this.__store.state
    this.actions = {} as any
    this.init()
  }

  init = () => {
    if (this.initialized) return
    Object.entries(this.options.getActions()).forEach(
      ([key, action]: [string, Action]) => {
        ;(this.actions as any)[key] = action.init(key, this)
      },
    )
    this.initialized = true
  }

  clearAll = () => {
    Object.keys(this.actions).forEach((key) => {
      this.actions[key]!.clear()
    })
  }
}

export type ActionByKey<
  TActions extends Record<string, AnyAction>,
  TKey extends keyof TActions,
> = TActions[TKey]

export interface ActionOptions<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  fn: (payload: TPayload) => TResponse | Promise<TResponse>
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
  key!: TKey
  client?: ActionClient<any>
  options: ActionOptions<TKey, TPayload, TResponse, TError>
  __store: Store<ActionStore<TPayload, TResponse, TError>>
  state: ActionStore<TPayload, TResponse, TError>

  constructor(options: ActionOptions<TKey, TPayload, TResponse, TError>) {
    this.__store = new Store<ActionStore<TPayload, TResponse, TError>>(
      {
        submissions: [],
        pendingSubmissions: [],
        latestSubmission: undefined,
      },
      {
        onUpdate: () => {
          this.__store.state = this.#resolveState(this.__store.state)
          this.state = this.__store.state
        },
      },
    )
    this.state = this.#resolveState(this.__store.state)
    this.options = options
  }

  init = (key: TKey, client: ActionClient<any, any>) => {
    this.client = client
    this.key = key as TKey
    return this as Action<TKey, TPayload, TResponse, TError>
  }

  #resolveState = (
    state: ActionStore<TPayload, TResponse, TError>,
  ): ActionStore<TPayload, TResponse, TError> => {
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
    this.__store.setState((s) => ({
      ...s,
      submissions: s.submissions.filter((d) => d.status === 'pending'),
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
        this.state.submissions[this.state.submissions.length - 1]
          ?.submittedAt === submission.submittedAt,
    }

    const setSubmission = (
      updater: (
        submission: ActionSubmission<TPayload, TResponse, TError>,
      ) => ActionSubmission<TPayload, TResponse, TError>,
    ) => {
      this.__store.setState((s) => {
        const a = s.submissions.find(
          (d) => d.submittedAt === submission.submittedAt,
        )

        invariant(a, 'Could not find submission in submission store')

        return {
          ...s,
          submissions: s.submissions.map((d) =>
            d.submittedAt === submission.submittedAt ? updater(d) : d,
          ),
        }
      })
    }

    this.__store.setState((s) => {
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
      const res = await this.options.fn?.(submission.payload)
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
  latestSubmission?: ActionSubmission<TPayload, TResponse, TError>
  pendingSubmissions: ActionSubmission<TPayload, TResponse, TError>[]
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
