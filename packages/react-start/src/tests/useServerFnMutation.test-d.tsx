import { useMutation } from '@tanstack/react-query'
import { createServerFn, useServerFn } from '@tanstack/react-start'

const serverFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => ({
    message: `Hello ${data.name}!`,
  }))

useMutation({
  mutationFn: useServerFn(serverFn),
  onSuccess: (data) => {
    data.message
  },
})
