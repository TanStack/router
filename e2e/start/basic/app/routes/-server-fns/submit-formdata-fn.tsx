import { createServerFn } from '@tanstack/start'

const testValues = {
  name: 'Sean',
}

export const greetUser = createServerFn()
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
    return new Response(`Hello, ${name}!.`)
  })

export function SubmitFormDataFn() {
  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Submit FormData Fn POST Call</h3>
      <div className="overflow-y-auto">
        It should return navigate and return{' '}
        <code>
          <pre data-testid="expected-submit-formdata-server-fn-result">
            Hello, {testValues.name}!
          </pre>
        </code>
      </div>
      <form
        className="flex flex-col gap-2"
        data-testid="submit-formdata-form"
        method="POST"
        action={greetUser.url}
      >
        <input type="text" name="name" defaultValue={testValues.name} />
        <button
          type="submit"
          data-testid="test-submit-formdata-fn-calls-btn"
          className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Submit (native)
        </button>
      </form>
    </div>
  )
}
