import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn, useServerFn } from '@tanstack/vue-start'
import { defineComponent, ref } from 'vue'

const getGreeting = createServerFn()
  .inputValidator((d: { name: string }) => d)
  .handler(({ data }) => {
    return { greeting: `Hello, ${data.name}!` }
  })

const postMessage = createServerFn({ method: 'POST' })
  .inputValidator((d: { message: string }) => d)
  .handler(({ data }) => {
    return { echo: `Echo: ${data.message}` }
  })

const ServerFnsComponent = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    const callGreeting = useServerFn(getGreeting)
    const callPostMessage = useServerFn(postMessage)
    const getResult = ref('')
    const postResult = ref('')

    return () => (
      <div>
        <h1 data-testid="server-fns-heading">Server Functions</h1>

        <div>
          <h2>Loader Result</h2>
          <p data-testid="loader-greeting">{loaderData.value.loaderGreeting}</p>
        </div>

        <div>
          <h2>GET Server Function</h2>
          <button
            data-testid="get-fn-btn"
            onClick={() => {
              callGreeting({ data: { name: 'Client' } }).then((r) => {
                getResult.value = r.greeting
              })
            }}
          >
            Call GET
          </button>
          <p data-testid="get-fn-result">{getResult.value}</p>
        </div>

        <div>
          <h2>POST Server Function</h2>
          <button
            data-testid="post-fn-btn"
            onClick={() => {
              callPostMessage({ data: { message: 'Hello from client' } }).then(
                (r) => {
                  postResult.value = r.echo
                },
              )
            }}
          >
            Call POST
          </button>
          <p data-testid="post-fn-result">{postResult.value}</p>
        </div>
      </div>
    )
  },
})

export const Route = createFileRoute('/server-fns')({
  loader: async () => {
    const result = await getGreeting({ data: { name: 'Loader' } })
    return { loaderGreeting: result.greeting }
  },
  component: ServerFnsComponent,
})
