import { signal } from '@angular/core'

export function injectMutation<TVariables, TData, TError = Error>(opts: {
  fn: (variables: TVariables) => Promise<TData>
  onSuccess?: (ctx: { data: TData }) => void | Promise<void>
}) {
  const submittedAt = signal<number | undefined>(undefined)
  const variables = signal<TVariables | undefined>(undefined)
  const error = signal<TError | undefined>(undefined)
  const data = signal<TData | undefined>(undefined)
  const status = signal<'idle' | 'pending' | 'success' | 'error'>('idle')

  const mutate = async (vars: TVariables): Promise<TData | undefined> => {
    status.set('pending')
    submittedAt.set(Date.now())
    variables.set(vars)
    //
    try {
      const result = await opts.fn(vars)
      await opts.onSuccess?.({ data: result })
      status.set('success')
      error.set(undefined)
      data.set(result)
      return result
    } catch (err: any) {
      status.set('error')
      error.set(err)
      throw err
    }
  }

  return {
    status,
    variables,
    submittedAt,
    mutate,
    error,
    data,
  }
}
