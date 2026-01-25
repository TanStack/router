import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { defineComponent, ref } from 'vue'
import { makeAsyncFoo, makeFoo } from '~/data'

const serverFn = createServerFn().handler(() => {
  return {
    asyncFoo: makeAsyncFoo('-serverFn'),
    foo: makeFoo('-serverFn'),
  }
})

const RouteComponent = defineComponent({
  name: 'ServerFunctionClassInstanceRoute',
  setup() {
    const resp = ref<null | Awaited<ReturnType<typeof serverFn>>>(null)

    return () => (
      <div>
        <button
          data-testid="server-function-btn"
          onClick={() => serverFn().then((response) => {
            resp.value = response;
          })}
        >
          trigger serverFn
        </button>
        <div data-testid="server-function-foo-response">
          {JSON.stringify(resp.value?.foo.value)}
        </div>
        <div data-testid="server-function-async-foo-response">
          {JSON.stringify(resp.value?.asyncFoo.echo())}
        </div>
      </div>
    )
  },
})


export const Route = createFileRoute('/server-function/class-instance')({
  component: RouteComponent,
})
