// createRouterAction is a constrained identify function that takes options: key, action, onSuccess, onError, onSettled, etc

import { createStore } from './reactivity'

export interface ActionOptions<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  key?: TKey
  action: (payload: TPayload) => TResponse | Promise<TResponse>
  onSuccess?: ActionCallback<TPayload, TResponse, TError>
  onEachSuccess?: ActionCallback<TPayload, TResponse, TError>
  onError?: ActionCallback<TPayload, TResponse, TError>
  onEachError?: ActionCallback<TPayload, TResponse, TError>
  onSettled?: ActionCallback<TPayload, TResponse, TError>
  onEachSettled?: ActionCallback<TPayload, TResponse, TError>
  maxSubmissions?: number
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
  store: ActionStore<TPayload, TResponse, TError>
}

export interface ActionStore<
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  latestSubmission?: ActionSubmission<TPayload, TResponse, TError>
  submissions: ActionSubmission<TPayload, TResponse, TError>[]
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
  status: 'idle' | 'pending' | 'success' | 'error'
  payload: TPayload
  response?: TResponse
  error?: TError
  isInvalid?: boolean
  invalidate: () => void
  isLatest: boolean
}

export function createAction<TKey extends string, TPayload, TResponse, TError>(
  options: ActionOptions<TKey, TPayload, TResponse, TError>,
): Action<TKey, TPayload, TResponse, TError> {
  const [store, setStore] = createStore<
    ActionStore<TPayload, TResponse, TError>
  >({
    submissions: [],
    get latestSubmission() {
      return this.submissions[this.submissions.length - 1]
    },
    get pendingSubmissions() {
      return this.submissions.filter(
        (s: ActionSubmission) => s.status === 'pending',
      )
    },
  })

  return {
    options,
    store,
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
        get isLatest() {
          return store.latestSubmission?.submittedAt === submission.submittedAt
        },
      }

      const setSubmission = (
        updater: (
          submission: ActionSubmission<TPayload, TResponse, TError>,
        ) => void,
      ) => {
        setStore((s) => {
          updater(
            s.submissions.find(
              (d) => d.submittedAt === submission.submittedAt,
            )!,
          )
        })
      }

      setStore((s) => {
        s.submissions.push(submission)
        s.submissions.reverse()
        s.submissions = s.submissions.slice(0, options.maxSubmissions ?? 10)
        s.submissions.reverse()
      })

      const after = async () => {
        options.onEachSettled?.(submission)
        if (submission.isLatest) await options.onSettled?.(submission)
      }

      try {
        const res = await options.action?.(submission.payload)
        setSubmission((s) => {
          s.response = res
        })
        await options.onEachSuccess?.(submission)
        if (submission.isLatest) await options.onSuccess?.(submission)
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
        if (submission.isLatest) await options.onError?.(submission)
        await after()
        setSubmission((s) => {
          s.status = 'error'
        })
        throw err
      }
    },
  }
}
