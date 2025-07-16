import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const Route = createFileRoute('/formdata-redirect/')({
  component: SubmitPostFormDataFn,
  validateSearch: z.object({
    mode: z.union([z.literal('js'), z.literal('no-js')]).default('js'),
  }),
})

const testValues = {
  name: 'Sean',
}

export const greetUser = createServerFn({ method: 'POST' })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error('Invalid! FormData is required')
    }
    const name = data.get('name')

    if (!name) {
      throw new Error('Name is required')
    }

    return {
      name: name.toString(),
    }
  })
  .handler(({ data: { name } }) => {
    throw redirect({ to: '/formdata-redirect/target/$name', params: { name } })
  })

function SubmitPostFormDataFn() {
  const mode = Route.useSearch({ select: (search) => search.mode })
  const greetUserFn = useServerFn(greetUser)
  return (
    <div className="p-2 m-2 grid gap-2">
      <h3>Submit POST FormData Fn Call</h3>
      <div className="overflow-y-auto">
        It should return redirect to /formdata-redirect/target/{testValues.name}{' '}
        and greet the user with their name:
        <code>
          <pre data-testid="expected-submit-post-formdata-server-fn-result">
            {testValues.name}
          </pre>
        </code>
      </div>
      <form
        className="flex flex-col gap-2"
        data-testid="submit-post-formdata-form"
        method="POST"
        action={greetUser.url}
        onSubmit={async (evt) => {
          if (mode === 'js') {
            evt.preventDefault()
            const data = new FormData(evt.currentTarget)
            await greetUserFn({ data })
          }
        }}
      >
        <input type="text" name="name" defaultValue={testValues.name} />
        <button
          type="submit"
          data-testid="test-submit-post-formdata-fn-calls-btn"
          className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Submit
        </button>
      </form>
    </div>
  )
}
