export const Route = createFileRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
    ],
  }),
  component: Page,
})

function Page() {
  return <h1>Charset</h1>
}
