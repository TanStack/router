// @ts-nocheck
import { Link, createFileRoute } from '@tanstack/react-native-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return <Link to="/">Home</Link>
}
