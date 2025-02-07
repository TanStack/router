import * as React from 'solid-js'

export function useMutation<TVariables, TData, TError = Error>(opts: {
  fn: (variables: TVariables) => Promise<TData>
  onSuccess?: (ctx: { data: TData }) => void | Promise<void>
}) {
  const [submittedAt, setSubmittedAt] = React.createSignal<number | undefined>()
  const [variables, setVariables] = React.createSignal<TVariables | undefined>()
  const [error, setError] = React.createSignal<TError | undefined>()
  const [data, setData] = React.createSignal<TData | undefined>()
  const [status, setStatus] = React.createSignal<
    'idle' | 'pending' | 'success' | 'error'
  >('idle')

  const mutate = async (variables: TVariables): Promise<TData | undefined> => {
    setStatus(() => 'pending')
    setSubmittedAt(() => Date.now())
    setVariables(() => variables)
    //
    try {
      const data = await opts.fn(variables)
      await opts.onSuccess?.({ data })
      setStatus(() => 'success')
      setError(() => undefined)
      setData((prev) => data)
      return data
    } catch (err: any) {
      setStatus(() => 'error')
      setError(() => err)
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
