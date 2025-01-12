import { createServerFn } from '@tanstack/start'
import { useState } from 'react'
// by using this we make sure DCE still works - this errors when imported on the client
import { getRequestHeader } from 'vinxi/http'

function sideEffect() {
  console.log('side effect')
  return true
}

const serverFn = createServerFn().handler(() => {
  // eslint-disable-next-line unused-imports/no-unused-vars
  const test = sideEffect()
  const header = getRequestHeader('X-Test')
  return header
})

export function DeadCodeFnCall() {
  const [serverFnOutput, setServerFnOutput] = useState<string>()
  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Dead code test</h3>
      <p>Clicking the button should result in a console log on the server</p>
      <p>Check the server logs for the message "side effect"</p>
      <button
        className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={() =>
          serverFn({ headers: { 'X-Test': 'hello' } }).then(setServerFnOutput)
        }
      >
        Call Dead Code Fn
      </button>
      <h4>Server output</h4>
      <pre>{serverFnOutput}</pre>
    </div>
  )
}
