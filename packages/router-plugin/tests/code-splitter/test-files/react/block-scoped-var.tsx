import { createFileRoute } from '@tanstack/react-router'

if (typeof window === 'undefined') {
  var environment = 'server'
}

for (var index = 0; index < 3; index++) {}

export { environment }

export const Route = createFileRoute('/')({
  loader: () => index,
  component: () => (
    <div>
      {environment} {index}
    </div>
  ),
})
