export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response('console.log("Hello from the server!")', {
      headers: {
        'Content-Type': 'application/javascript',
      },
    })
  },
})
