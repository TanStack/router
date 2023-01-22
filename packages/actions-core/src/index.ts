// RouterAction is a constrained identify function that takes options: key, action, onSuccess, onError, onSettled, etc

import invariant from 'tiny-invariant'
import { Store } from '@tanstack/store'

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

export class Action<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
> {
  options: ActionOptions<TKey, TPayload, TResponse, TError>
  store: Store<ActionStore<TPayload, TResponse, TError>>

  constructor(options: ActionOptions<TKey, TPayload, TResponse, TError>) {
    this.store = new Store<ActionStore<TPayload, TResponse, TError>>({
      submissions: [],
    })
    this.options = options
  }

  reset = () => {
    this.store.setState((s) => {
      s.submissions = []
    })
  }

  submit = async (payload?: TPayload): Promise<TResponse> => {
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
        this.store.state.submissions[this.store.state.submissions.length - 1]
          ?.submittedAt === submission.submittedAt,
    }

    const setSubmission = (
      updater: (
        submission: ActionSubmission<TPayload, TResponse, TError>,
      ) => void,
    ) => {
      this.store.setState((s) => {
        const a = s.submissions.find(
          (d) => d.submittedAt === submission.submittedAt,
        )

        invariant(a, 'Could not find submission in this.store')

        updater(a)
      })
    }

    this.store.setState((s) => {
      s.submissions.push(submission)
      s.submissions.reverse()
      s.submissions = s.submissions.slice(0, this.options.maxSubmissions ?? 10)
      s.submissions.reverse()
    })

    const after = async () => {
      this.options.onEachSettled?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestSettled?.(submission)
    }

    try {
      const res = await this.options.action?.(submission.payload)
      setSubmission((s) => {
        s.response = res
      })
      await this.options.onEachSuccess?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestSuccess?.(submission)
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
      await this.options.onEachError?.(submission)
      if (submission.getIsLatest())
        await this.options.onLatestError?.(submission)
      await after()
      setSubmission((s) => {
        s.status = 'error'
      })
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
  status: 'idle' | 'pending' | 'success' | 'error'
  payload: TPayload
  response?: TResponse
  error?: TError
  isInvalid?: boolean
  invalidate: () => void
  getIsLatest: () => boolean
}
