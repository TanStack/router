export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response('console.log("Hello from customScript.js!")', {
      headers: {
        'Content-Type': 'application/javascript',
      },
    })
  },
})
