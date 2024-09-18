import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: () => ({data: 'Usuário🤠'}),
  component: Component
})


function Component() {
    return <div>Usuário 🤡</div>
}