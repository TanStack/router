import { sleep } from '../../posts'

export const Route = createFileRoute({
  loader: async () => {
    await sleep(1000)
    return { foo: 'bar' }
  },
})
