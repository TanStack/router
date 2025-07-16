export const Route = createFileRoute({
  beforeLoad: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return { hello: 'world' as string }
  },
})
