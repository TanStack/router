import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getSeparateFileContent } from './-separateFile'

// Control: identical to ./co-located.tsx except the server function lives in its
// own module. This was the documented workaround, and it kept working throughout,
// so it guards against a fix that only ever exercises the co-located path.
//
// The extracted module deliberately avoids a `.server.` suffix: import protection
// treats those as server-only and replaces them with a mock on the client, which
// breaks the route rather than exercising the workaround.
export const Route = createFileRoute('/separate-file')({
  loader: () => getSeparateFileContent(),
  component: SeparateFileComponent,
})

function SeparateFileComponent() {
  const Server = Route.useLoaderData()
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1 data-testid="separate-file-marker">separate-file-baseline</h1>

      <p data-testid="separate-file-count">Count: {count}</p>
      <button
        type="button"
        data-testid="separate-file-increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>

      {Server}
    </main>
  )
}
