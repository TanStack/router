import { createFileRoute } from '@tanstack/react-router'
import redaxios from 'redaxios'

export const Route = createFileRoute('/api-test')({
  loader: async () => {
    const res = await redaxios.get('/api/test').then((res) => res.data)
  },
  component: ApiTest,
})

function ApiTest() {
  return (
    <div className="p-2">
      <h3>This uses an API route!</h3>
      <div>
        <div>API Route JSON:</div>
        <pre>{JSON.stringify({ hello: 'world' }, null, 2)}</pre>
      </div>
    </div>
  )
}
