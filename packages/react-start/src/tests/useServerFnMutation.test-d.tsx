import { useMutation } from '@tanstack/react-query'
import { createServerFn, useServerFn } from '../index'

const serverFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => ({
    message: `Hello ${data.name}!`,
  }))

const optionalServerFn = createServerFn().handler(async () => ({
  ok: true as const,
}))

export function UseServerFnMutationRegressionComponent() {
  const mutation = useMutation({
    mutationFn: useServerFn(serverFn),
    onSuccess: (data, variables) => {
      data.message
      variables.data.name
    },
  })

  void mutation
  return null
}

export function useOptionalServerFnRegressionHook() {
  const optionalHandler = useServerFn(optionalServerFn)

  optionalHandler().then((result) => {
    result.ok
  })

  void optionalHandler()
  void optionalHandler(undefined)
}
