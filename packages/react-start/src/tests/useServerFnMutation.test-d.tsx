import { useMutation } from '@tanstack/react-query'
import { createServerFn, useServerFn } from '../index'

const serverFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    return await Promise.resolve({
      message: `Hello ${data.name}!`,
    })
  })

const optionalServerFn = createServerFn().handler(async () => {
  return await Promise.resolve({
    ok: true as const,
  })
})

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
