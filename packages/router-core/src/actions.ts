// RouterAction is a constrained identify function that takes options: key, action, onSuccess, onError, onSettled, etc

import invariant from 'tiny-invariant'
import { batch, createStore, Store } from './store'

export interface ActionOptions<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  key?: TKey
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

type ActionCallback<TPayload, TResponse, TError> = (
  submission: ActionSubmission<TPayload, TResponse, TError>,
) => void | Promise<void>

export interface Action<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  options: ActionOptions<TKey, TPayload, TResponse, TError>
  submit: (payload?: TPayload) => Promise<TResponse>
  reset: () => void
  store: Store<ActionStore<TPayload, TResponse, TError>>
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
  status: 'idle' | 'pending' | 'success' | 'error'
  payload: TPayload
  response?: TResponse
  error?: TError
  isInvalid?: boolean
  invalidate: () => void
  getIsLatest: () => boolean
}

export function createAction<TKey extends string, TPayload, TResponse, TError>(
  options: ActionOptions<TKey, TPayload, TResponse, TError>,
): Action<TKey, TPayload, TResponse, TError> {
  const store = createStore<ActionStore<TPayload, TResponse, TError>>(
    {
      submissions: [],
    },
    options.debug,
  )

  return {
    options,
    store,
    reset: () => {
      store.setState((s) => {
        s.submissions = []
      })
    },
    submit: async (payload) => {
      const submission: ActionSubmission<TPayload, TResponse, TError> = {
        submittedAt: Date.now(),
        status: 'pending',
        payload: payload as TPayload,
        invalidate: () => {
          setSubmission((s) => {
            s.isInvalid = true
          })
        },
        getIsLatest: () =>
          store.state.submissions[store.state.submissions.length - 1]
            ?.submittedAt === submission.submittedAt,
      }

      const setSubmission = (
        updater: (
          submission: ActionSubmission<TPayload, TResponse, TError>,
        ) => void,
      ) => {
        store.setState((s) => {
          const a = s.submissions.find(
            (d) => d.submittedAt === submission.submittedAt,
          )

          invariant(a, 'Could not find submission in store')

          updater(a)
        })
      }

      store.setState((s) => {
        s.submissions.push(submission)
        s.submissions.reverse()
        s.submissions = s.submissions.slice(0, options.maxSubmissions ?? 10)
        s.submissions.reverse()
      })

      const after = async () => {
        options.onEachSettled?.(submission)
        if (submission.getIsLatest())
          await options.onLatestSettled?.(submission)
      }

      try {
        const res = await options.action?.(submission.payload)
        setSubmission((s) => {
          s.response = res
        })
        await options.onEachSuccess?.(submission)
        if (submission.getIsLatest())
          await options.onLatestSuccess?.(submission)
        await after()
        setSubmission((s) => {
          s.status = 'success'
        })
        return res
      } catch (err: any) {
        console.error(err)
        setSubmission((s) => {
          s.error = err
        })
        await options.onEachError?.(submission)
        if (submission.getIsLatest()) await options.onLatestError?.(submission)
        await after()
        setSubmission((s) => {
          s.status = 'error'
        })
        throw err
      }
    },
  }
}
